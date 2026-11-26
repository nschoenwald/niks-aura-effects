import { refreshLiveScenes } from "./helpers.mjs";

const gmQueue = new foundry.utils.Semaphore();

// Live scene refreshes run one after another, and bursts (e.g. pulling every player to a scene) collapse into one
let liveScenesRefresh = Promise.resolve();
const scheduleLiveScenesRefresh = foundry.utils.debounce(() => {
  liveScenesRefresh = liveScenesRefresh.then(refreshLiveScenes).catch(err => console.error(err));
}, 250);

/**
 * Refresh auras on all live scenes, for the active GM only. Requested by players whose canvas changed scene.
 * @returns {boolean}   true
 */
function refreshLiveScenesQuery() {
  if (game.user.isActiveGM) scheduleLiveScenesRefresh();
  return true;
}

/**
 * Collect the ids of the given Active Effects per parent, skipping effects which are already gone
 * @param {string[]} effectUuids
 * @returns {Map<ClientDocument, Set<string>>}
 */
function getDeletionsByParent(effectUuids) {
  const idsByParent = new Map();
  for (const uuid of new Set(effectUuids)) {
    const effect = fromUuidSync(uuid);
    if (!(effect instanceof ActiveEffect) || !effect.parent?.effects.has(effect.id)) continue;
    if (!idsByParent.has(effect.parent)) idsByParent.set(effect.parent, new Set());
    idsByParent.get(effect.parent).add(effect.id);
  }
  return idsByParent;
}

/**
 * Build the batch operations for deletions and creations. Deletions come first, so a removed copy and its replacement
 * reach every client in one batch.
 * @param {Map<ClientDocument, Set<string>>} idsByParent
 * @param {Map<Actor, Object[]>} createsByActor
 * @returns {Object[]}
 */
function getBatchOperations(idsByParent, createsByActor = new Map()) {
  const animate = !game.settings.get("auraeffects", "disableScrollingText");
  const operations = [];
  for (const [parent, ids] of idsByParent) {
    if (ids.size) operations.push({ action: "delete", documentName: "ActiveEffect", parent, ids: Array.from(ids), animate });
  }
  for (const [parent, data] of createsByActor) {
    if (data.length) operations.push({ action: "create", documentName: "ActiveEffect", parent, data, animate });
  }
  return operations;
}

/**
 * Delete all Active Effects whose UUIDs are provided (ignoring any UUIDs which do NOT correspond to Active Effects)
 * @param {Object} data                 Query input data
 * @param {string[]} data.effectUuids   A list of UUIDs for each Active Effect that should be deleted 
 * @returns {Promise<boolean>}          true
 */
async function deleteEffects({ effectUuids }) {
  await gmQueue.add(() => {
    const batchOperations = getBatchOperations(getDeletionsByParent(effectUuids));
    if (batchOperations.length) return foundry.documents.modifyBatch(batchOperations);
  });
  return true;
}

/**
 * Get the data for the copy of an aura effect which is applied to an actor
 * @param {ActiveEffect} effect   The source aura effect
 * @param {Actor} actor           The actor receiving the copy
 * @returns {Object}              The applied effect's data
 */
function getAppliedEffectData(effect, actor) {
  const effectData = foundry.utils.mergeObject(effect.toObject(), {
    name: effect.system.overrideName?.trim() || effect.name,
    origin: effect.uuid,
    type: effect.getFlag("auraeffects", "originalType") ?? "base",
    transfer: false,
    "flags.auraeffects.fromAura": effect.uuid
  });
  if (!effect.system.canStack) {
    const bestValue = new Roll(effect.system.bestFormula.trim() || "0", effect.parent?.getRollData?.()).evaluateSync().total;
    foundry.utils.setProperty(effectData, "flags.auraeffects.bestValue", bestValue);
  }
  const changes = effectData.system.changes ?? [];
  if (game.modules.get("dae")?.active) {
    for (const change of changes) {
      if (typeof change.value !== "string") continue;
      change.value = Roll.replaceFormulaData(change.value, effect.parent?.getRollData?.());
      change.value = change.value.replaceAll("##", "@");
    }
  } else if (effect.system.evaluatePreApply) {
    for (const change of changes) {
      if (typeof change.value !== "string") continue;
      change.value = Roll.replaceFormulaData(change.value, effect.parent?.getRollData?.());
    }
  }
  // Copies on the source's own actor stay hidden. Elsewhere, the default "if temporary" would hide the copy (auras have
  // no duration), so it becomes "always"; an explicit "never" or "always" on the source is kept.
  const { NEVER, CONDITIONAL, ALWAYS } = CONST.ACTIVE_EFFECT_SHOW_ICON;
  if (actor === effect.actor) effectData.showIcon = NEVER;
  else if ((effectData.showIcon ?? CONDITIONAL) === CONDITIONAL) effectData.showIcon = ALWAYS;
  return effectData;
}

/**
 * Work out the copies to create for the given actors and auras, skipping auras which are already applied; also
 * choosing best of multiple if a non-stacking effect, so that only one is applied. Copies being deleted in the same
 * batch count as gone. A weaker non-stacking copy that gets replaced is added to the deletions.
 * @param {Object<string, string[]>} actorToEffectsMap    Actor UUIDs as keys, lists of source ActiveEffect UUIDs as values
 * @param {Map<ClientDocument, Set<string>>} idsByParent  Deletions in the same batch, extended in place
 * @returns {Map<Actor, Object[]>}                        The effect data to create per actor
 */
function getCreations(actorToEffectsMap, idsByParent) {
  const createsByActor = new Map();
  for (const [actorUuid, effectUuids] of Object.entries(actorToEffectsMap)) {
    const actor = fromUuidSync(actorUuid);
    // The actor may have been deleted while this request was queued
    if (!actor) continue;
    const batchCreate = [];
    if (!idsByParent.has(actor)) idsByParent.set(actor, new Set());
    const batchDelete = idsByParent.get(actor);
    const allEffects = actor.effects.filter(e => !batchDelete.has(e.id));
    for (const uuid of effectUuids) {
      // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
      if (allEffects.some(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(uuid))) continue;
      const effect = fromUuidSync(uuid);
      if (!effect) continue;
      const effectData = getAppliedEffectData(effect, actor);
      if (!effect.system.canStack) {
        const bestValue = effectData.flags.auraeffects.bestValue;
        const existingEffect = allEffects.find(e => e.flags?.auraeffects?.fromAura && e.name === effectData.name);
        if (existingEffect) {
          const currBest = existingEffect.flags.auraeffects.bestValue ?? 0;
          if (!game.settings.get("auraeffects", "preferLatest") && (currBest >= bestValue)) continue;
          else if (currBest > bestValue) continue;
          batchDelete.add(existingEffect.id);
        }
      }
      const existing = batchCreate.find(e => e.name === effectData.name);
      const existingBestValue = existing?.flags.auraeffects.bestValue;
      if (existingBestValue === undefined) batchCreate.push(effectData);
      else if (effectData.flags.auraeffects.bestValue > existingBestValue) batchCreate.findSplice(e => e === existing, effectData);
    }
    if (batchCreate.length) createsByActor.set(actor, batchCreate);
  }
  return createsByActor;
}

/**
 * Create potentially multiple Active Effects on potentially multiple Actors, modifying the provided effects as
 * necessary for "aura effect" treatment and skipping effects which already exist; also choosing best of multiple
 * if a non-stacking effect, so that only one is applied
 * @param {Object<string, string[]>} actorToEffectsMap  An object with Actor UUIDs as keys, and lists of ActiveEffect UUIDs as values
 * @returns {Promise<boolean>}                          true
 */
async function applyAuraEffects(actorToEffectsMap) {
  return modifyAuras({ apply: actorToEffectsMap });
}

/**
 * Remove applied aura copies and apply auras in one batch, so that every client prepares the affected actors and
 * redraws their tokens once instead of once per step
 * @param {Object} data
 * @param {string[]} [data.remove]                    UUIDs of applied copies to delete
 * @param {Object<string, string[]>} [data.apply]     Actor UUIDs as keys, lists of source ActiveEffect UUIDs as values
 * @returns {Promise<boolean>}                        true
 */
async function modifyAuras({ remove = [], apply = {} } = {}) {
  await gmQueue.add(() => {
    const idsByParent = getDeletionsByParent(remove);
    const createsByActor = getCreations(apply, idsByParent);
    const batchOperations = getBatchOperations(idsByParent, createsByActor);
    if (batchOperations.length) return foundry.documents.modifyBatch(batchOperations);
  });
  return true;
}

/**
 * Bring already-applied copies of aura effects up to date with their (possibly edited) source effects
 * @param {Object<string, string[]>} actorToEffectsMap  An object with Actor UUIDs as keys, and lists of source ActiveEffect UUIDs as values
 * @returns {Promise<boolean>}                          true
 */
async function updateAppliedEffects(actorToEffectsMap) {
  await gmQueue.add(() => {
    const allBatchOperations = [];
    for (const [actorUuid, effectUuids] of Object.entries(actorToEffectsMap)) {
      const actor = fromUuidSync(actorUuid);
      if (!actor) continue;
      const updates = [];
      for (const uuid of effectUuids) {
        const effect = fromUuidSync(uuid);
        // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
        const applied = actor.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(uuid));
        if (!effect || !applied) continue;
        const { _id, _stats, ...effectData } = getAppliedEffectData(effect, actor);
        updates.push({ ...effectData, _id: applied.id });
      }
      // Unchanged copies are dropped by the client before reaching the server
      if (updates.length) allBatchOperations.push({
        action: "update",
        documentName: "ActiveEffect",
        parent: actor,
        updates
      });
    }
    if (allBatchOperations.length) return foundry.documents.modifyBatch(allBatchOperations);
  });
  return true;
}

/**
 * For a given token, batch region creation, update, and deletion
 * @param {string} tokenUuid 
 * @param {RegionData[]} toCreate 
 * @param {RegionData[]} toUpdate
 * @param {string[]} toDelete 
 */
async function updateRegionsForToken({tokenUuid, toCreate=[], toUpdate=[], toDelete=[]}) {
  await gmQueue.add(async () => {
    const token = await fromUuid(tokenUuid);
    const scene = token?.parent;
    if ( !scene ) return;
    const batchOperations = [];
    const alreadyHas = (regionData) => {
      const origin = foundry.utils.getProperty(regionData, "flags.auraeffects.origin");
      return token.attachments.regions.some(r => r.getFlag("auraeffects", "origin") === origin);
    }
    toCreate = toCreate.filter(r => !alreadyHas(r));
    if ( toCreate.length ) batchOperations.push({
      action: "create",
      documentName: "Region",
      parent: scene,
      data: toCreate
    });
    toUpdate = toUpdate.filter(alreadyHas);
    if ( toUpdate.length ) batchOperations.push({
      action: "update",
      documentName: "Region",
      parent: scene,
      updates: toUpdate
    });
    toDelete = toDelete.filter(id => token.attachments.regions.some(r => r.id === id));
    if ( toDelete.length ) batchOperations.push({
      action: "delete",
      documentName: "Region",
      parent: scene,
      ids: toDelete
    });
    if ( !batchOperations.length ) return;
    return foundry.documents.modifyBatch(batchOperations);
  });
  return true;
}

export {
  applyAuraEffects,
  deleteEffects,
  modifyAuras,
  refreshLiveScenesQuery,
  scheduleLiveScenesRefresh,
  updateAppliedEffects,
  updateRegionsForToken
};