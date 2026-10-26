/** @import { ActiveEffect, Actor, Scene, TokenDocument } from "@client/documents/_module.mjs" */
/** @import { RegionData } from "@common/documents/_types.mjs" */

// Compiled conditional scripts, keyed by script source
const compiledScripts = new Map();

/**
 * Execute the script on an aura active effect for a given token, returning whether said token should receive
 * the effect or not
 * @param {TokenDocument} sourceToken   The aura-emanating token
 * @param {TokenDocument} token         The potential aura effect recipient token
 * @param {ActiveEffect} effect         The aura effect in question
 * @returns {boolean}                   true if effect should be applied, false if not (including if the script errors)
 */
function executeScript(sourceToken, token, effect) {
  const script = effect.system.script ?? "";
  if (!script.trim().length) return true;
  const actor = token.actor;
  try {
    let toEvaluate = compiledScripts.get(script);
    if (!toEvaluate) {
      toEvaluate = Function("actor", "token", "sourceToken", "rollData", `return Boolean(${script});`);
      compiledScripts.set(script, toEvaluate);
    }
    // Placeables only exist for the scene this client is viewing; fall back to the documents otherwise
    return toEvaluate(actor, token.object ?? token, sourceToken.object ?? sourceToken, actor.getRollData());
  } catch (error) {
    console.error(_loc("AURAEFFECTS.Errors.ScriptError", {
      actor: sourceToken.actor.name,
      effect: effect.name,
      error
    }));
    return false;
  }
}

/**
 * Get the relationship between two tokens' dispositions: 1 if allied, -1 if opposed, 0 if either is neutral.
 * Secret tokens count as hostile.
 * @param {TokenDocument} tokenA
 * @param {TokenDocument} tokenB
 * @returns {number}
 */
function getDispositionRelation(tokenA, tokenB) {
  const { SECRET, HOSTILE } = CONST.TOKEN_DISPOSITIONS;
  const normalize = d => (d === SECRET) ? HOSTILE : d;
  return Math.sign(normalize(tokenA.disposition) * normalize(tokenB.disposition));
}

/**
 * Get the tokens which represent an actor on the active scene and on the scene this client is viewing (active scene
 * first). Unlike Actor#getActiveTokens, this doesn't depend solely on which scene the current user happens to view.
 * @param {Actor} actor
 * @returns {TokenDocument[]}
 */
function getActorTokens(actor) {
  if (!actor) return [];
  if (actor.isToken) return actor.token?.parent ? [actor.token] : [];
  const scenes = Array.from(new Set([game.scenes?.active, canvas?.scene].filter(Boolean)));
  if (!scenes.length) return [];
  return actor.getDependentTokens({ scenes, concreteOnly: true });
}

/**
 * Get all active (enabled & unsuppressed) "source" aura effects on a given actor
 * @param {Actor} actor               The actor to check
 * @param {TokenDocument} [token]     The emitting token, if suppression should be checked for that token
 * @returns {ActiveEffect[]}          The active aura effects
 */
function getActiveAuraEffects(actor, token) {
  const activeAuras = [];
  if (!actor) console.warn("Aura Effects: Actorless tokens are not supported and will be ignored.");
  for (const effect of actor?.allApplicableEffects() ?? []) {
    if (effect.type !== "auraeffects.aura") continue;
    const suppressed = token ? effect.system.isSuppressedFor(token) : effect.isSuppressed;
    if (!effect.disabled && !suppressed) activeAuras.push(effect);
  }
  return activeAuras;
}

/**
 * Get all aura-providing regions that a token is currently within
 * @param {TokenDocument} token
 * @returns {RegionDocument[]} 
 */
function getAuraRegions(token) {
  return Array.from(token.regions.filter(r => r.getFlag("auraeffects", "origin")));
}

/**
 * Returns whether the provided aura effect should apply to the provided token
 * @param {ActiveEffect} effect 
 * @param {TokenDocument} token 
 */
function auraShouldApply(effect, token) {
  // Actorless or sceneless token
  if (!token.actor || !token.parent) return false;
  // Not in range
  const region = getAuraRegions(token).find(r => r.getFlag("auraeffects", "origin") === effect.uuid);
  if (!region) return false;
  // Somehow despite being in range, no source token
  const sourceToken = region.attachment.token;
  if (!sourceToken) return false;
  if (!effect.system.applyToSelf && (sourceToken.actor === token.actor)) return false;
  // Disposition doesn't match
  const disposition = getDispositionRelation(token, sourceToken);
  if (![0, disposition].includes(effect.system.disposition)) return false;
  // Script doesn't pass
  if (!executeScript(sourceToken, token, effect)) return false;
  // All good
  return true;
}

/**
 * Remove specified auras, ensuring that any non-stacking auras perform a search for the "next-best"
 * and apply it, if present
 * @param {ActiveEffect[]} effects  The effects which will be removed
 * @param {Scene} scene             The scene on which to perform any necessary logic
 */
async function removeAndReplaceAuras(effects, scene) {
  const activeGM = game.users.activeGM;

  effects = effects.filter(Boolean);

  // Get map of effect name -> tokens removed from (only for non-stacking effects)
  // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
  const effectToRemovedMap = effects.reduce((acc, effect) => {
    const fromAura = effect.getFlag("auraeffects", "fromAura");
    if (fromUuidSync((fromAura === true) ? effect.origin : fromAura)?.system.canStack) return acc;
    acc[effect.name] ??= [];
    acc[effect.name].push(...effect.parent.getDependentTokens({ scenes: scene, concreteOnly: true }));
    return acc;
  }, {});

  // Remove effects
  if (effects.length) await activeGM.query("auraeffects.deleteEffects", { effectUuids: effects.map(e => e.uuid) });

  // Get all on-scene aura sources for the effects just deleted, sort by best, apply to tokens as possible
  const newBestApplyMap = {};
  Object.keys(effectToRemovedMap).forEach(effectName => {
    const ranked = scene.tokens.reduce((acc, token) => {
      const effect = getActiveAuraEffects(token.actor, token).find(e => (e.system.overrideName.trim() || e.name) === effectName);
      if (!effect) return acc;
      const bestFormula = effect.system.bestFormula?.trim();
      // Sources without a formula rank last
      const best = bestFormula ? new Roll(bestFormula, token.actor.getRollData()).evaluateSync().total : -Infinity;
      acc.push({ effect, best });
      return acc;
    }, []).sort((a, b) => b.best - a.best);

    for (const targetToken of effectToRemovedMap[effectName]) {
      const replacement = ranked.find(({ effect }) => auraShouldApply(effect, targetToken));
      if (!replacement) continue;
      newBestApplyMap[targetToken.actor.uuid] ??= [];
      newBestApplyMap[targetToken.actor.uuid].push(replacement.effect.uuid);
    }
  });
  if (!foundry.utils.isEmpty(newBestApplyMap)) return activeGM.query("auraeffects.applyAuraEffects", newBestApplyMap);
}

/**
 * Get the system data submitted by an Active Effect Config form, with changes serialized into an array
 * @param {Object} submitData   The processed form data
 * @returns {Object}
 */
function getFormSystemData(submitData) {
  const system = submitData.system ?? {};
  if (system.changes && (foundry.utils.getType(system.changes) !== "Array")) system.changes = Object.values(system.changes);
  return system;
}

/**
 * Insert the new "aura" tab's Handlebars template part into an existing object of PARTS, for use when
 * extending an existing AE Config Sheet
 * @param {Record<string, HandlebarsTemplatePart} origParts     The application's original PARTS
 * @returns {Record<string, HandlebarsTemplatePart>}            The extended PARTS
 */
function getExtendedParts(origParts) {
  return Object.fromEntries(Object.entries(origParts).toSpliced(-1, 0, ["aura", { template: "modules/auraeffects/templates/auraConfig.hbs" }]));
}

/**
 * Add the new "aura" tab to an existing TABS object, for use when extending an existing AE Config Sheet
 * @param {Record<string, ApplicationTabsConfiguration>} origTabs   The application's original TABS
 * @returns {Record <string, ApplicationTabsConfiguration>}         The extended TABS
 */
function getExtendedTabs(origTabs) {
  return {
    sheet: {
      ...origTabs.sheet,
      tabs: [
        ...origTabs.sheet.tabs,
        { id: "aura", icon: "fa-solid fa-person-rays" }
      ]
    }
  };
}

/**
 * Create or delete all token-attached regions as necessary
 * @param {TokenDocument} token         A specified token document
 */
async function updateAllAuraRegions(token) {
  if (!token.actor) return;
  const activeSourceEffects = getActiveAuraEffects(token.actor, token);
  const attachedAuraRegions = Array.from(token.attachments.regions.filter(r => r.getFlag("auraeffects", "origin")));
  if (!activeSourceEffects.length && !attachedAuraRegions.length) return;
  const shouldHaveUuids = new Set(activeSourceEffects.map(e => e.uuid));
  const toDelete = attachedAuraRegions.filter(r => !shouldHaveUuids.has(r.flags.auraeffects.origin)).map(r => r.id);
  const toCreate = [];
  const toUpdate = [];
  const retained = [];
  for (const effect of activeSourceEffects) {
    const existingRegion = attachedAuraRegions.find(r => r.getFlag("auraeffects", "origin") === effect.uuid);
    if (!existingRegion) {
      toCreate.push(getRegionDataFromEffect(effect, token));
      continue;
    }
    retained.push([existingRegion, effect]);
    const updateData = getRegionDataFromEffect(effect, token);
    // Skip the round trip to the GM for regions which wouldn't change
    let changed = true;
    try {
      changed = !foundry.utils.isEmpty(existingRegion.updateSource(foundry.utils.deepClone(updateData), { dryRun: true }));
    } catch {}
    if (changed) toUpdate.push({_id: existingRegion.id, ...updateData});
  }
  if (toCreate.length || toUpdate.length || toDelete.length) {
    await game.users.activeGM.query("auraeffects.updateRegionsForToken", { tokenUuid: token.uuid, toCreate, toUpdate, toDelete });
  }
  // Re-evaluate tokens within retained regions, since the source effect's settings may have changed
  const toRemove = [];
  const toAdd = {};
  for (const [region, sourceEffect] of retained) {
    for (const currToken of region.tokens) {
      if (!currToken.actor) continue;
      // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
      const currAppliedEffect = currToken.actor.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid));
      if (currAppliedEffect) {
        if (!auraShouldApply(sourceEffect, currToken)) toRemove.push(currAppliedEffect);
      } else if (auraShouldApply(sourceEffect, currToken)) {
        (toAdd[currToken.actor.uuid] ??= []).push(sourceEffect.uuid);
      }
    }
  }
  if (toRemove.length) await removeAndReplaceAuras(toRemove, token.parent);
  if (!foundry.utils.isEmpty(toAdd)) await game.users.activeGM.query("auraeffects.applyAuraEffects", toAdd);
}

/**
 * Ensure all applied auras shouldn't be removed, and all non-applied auras shouldn't be applied
 * @param {TokenDocument} token 
 */
// TODO: Any way to keep this from always toggling between effects if prefer recent is on & both require conditionals?
async function refreshConditionalAuras(token) {
  if (!token.actor) return;
  const toRemove = [];
  const toAdd = [];
  for (const region of getAuraRegions(token)) {
    const sourceEffect = fromUuidSync(region.getFlag("auraeffects", "origin"));
    if (!sourceEffect?.system.script.length) continue;
    // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
    const existingEffect = token.actor.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid));
    const shouldApply = auraShouldApply(sourceEffect, token);
    if (existingEffect && !shouldApply) toRemove.push(existingEffect);
    else if (!existingEffect && shouldApply) toAdd.push(sourceEffect.uuid);
  }
  if (toRemove.length) await removeAndReplaceAuras(toRemove, token.parent);
  if (toAdd.length) await game.users.activeGM.query("auraeffects.applyAuraEffects", {[token.actor.uuid]: toAdd});
}

/**
 * Fully reconcile the auras applied to a token's actor against the aura regions on the token's scene: remove applied
 * auras whose source region the token isn't in (e.g. left over from another scene), and apply any that are missing
 * @param {TokenDocument} token
 */
async function refreshAllAuras(token) {
  if (!token.actor || !token.parent) return;
  const sceneAuraRegions = token.parent.regions.filter(r => r.getFlag("auraeffects", "origin"));
  const toRemove = [];
  const kept = [];
  // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
  for (const effect of token.actor.effects) {
    const fromAura = effect.getFlag("auraeffects", "fromAura");
    if (!fromAura) continue;
    const originUuid = (fromAura === true) ? effect.origin : fromAura;
    const originRegions = sceneAuraRegions.filter(r => r.getFlag("auraeffects", "origin") === originUuid);
    const sourceEffect = fromUuidSync(originUuid);
    if (sourceEffect && originRegions.some(r => token.regions.has(r))) {
      if (auraShouldApply(sourceEffect, token)) kept.push(effect);
      else toRemove.push(effect);
    }
    // Region membership lags behind newly created or reshaped regions; the updateToken hook handles those
    else if (originRegions.some(r => token.testInsideRegion(r))) kept.push(effect);
    else toRemove.push(effect);
  }
  const keptNames = new Set(kept.map(e => e.name));
  const toAdd = [];
  for (const region of getAuraRegions(token)) {
    const sourceEffect = fromUuidSync(region.getFlag("auraeffects", "origin"));
    if (!sourceEffect) continue;
    if (kept.some(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid))) continue;
    // Don't swap out an already-applied non-stacking aura of the same name
    if (!sourceEffect.system.canStack && keptNames.has(sourceEffect.system.overrideName?.trim() || sourceEffect.name)) continue;
    if (auraShouldApply(sourceEffect, token)) toAdd.push(sourceEffect.uuid);
  }
  if (toRemove.length) await removeAndReplaceAuras(toRemove, token.parent);
  if (toAdd.length) await game.users.activeGM.query("auraeffects.applyAuraEffects", {[token.actor.uuid]: toAdd});
}

/**
 * Rebuild all aura regions on a scene and fully reconcile every token's applied auras against them. World actors
 * without any token on the scene lose all applied auras, since those can only stem from another scene.
 * @param {Scene} scene
 */
async function refreshSceneAuras(scene) {
  const activeGM = game.users.activeGM;
  if (!activeGM) return;
  const tokens = scene.tokens.filter(t => t.actor);
  for (const token of tokens) await updateAllAuraRegions(token);
  for (const token of tokens) await refreshAllAuras(token);
  const presentActorIds = new Set(scene.tokens.map(t => t.actorId));
  const stale = game.actors
    .filter(a => !presentActorIds.has(a.id))
    .flatMap(a => a.effects.filter(e => e.getFlag("auraeffects", "fromAura")));
  if (stale.length) await activeGM.query("auraeffects.deleteEffects", { effectUuids: stale.map(e => e.uuid) });
}

/**
 * Bring the copies of a source aura applied to tokens within its region up to date with the source effect
 * @param {ActiveEffect} effect   The source aura effect
 * @param {TokenDocument} token   The emitting token
 */
async function syncAppliedAuras(effect, token) {
  const toSync = {};
  for (const region of token.attachments.regions) {
    if (region.getFlag("auraeffects", "origin") !== effect.uuid) continue;
    for (const currToken of region.tokens) {
      // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
      if (!currToken.actor?.effects.some(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(effect.uuid))) continue;
      toSync[currToken.actor.uuid] = [effect.uuid];
    }
  }
  if (!foundry.utils.isEmpty(toSync)) await game.users.activeGM.query("auraeffects.updateAppliedEffects", toSync);
}

/**
 * Get region creation data from an aura effect and a given token
 * @param {ActiveEffect} effect 
 * @param {TokenDocument} token
 * @returns {RegionData}
 */
function getRegionDataFromEffect(effect, token) {
  if (effect.type !== "auraeffects.aura") return {};
  const tokenOwner = game.users.getDesignatedUser(u => u.character === token.actor) ?? game.users.activeGM
  const restriction = {enabled: false};
  if (effect.system.collisionType.length) {
    restriction.enabled = true;
    restriction.type = effect.system.collisionType;
  }
  const regionData = {
    attachment: {
      token: token.id
    },
    color: (effect.system.color ?? tokenOwner?.color)?.css,
    displayMeasurements: false,
    flags: {
      auraeffects: {
        origin: effect.uuid
      }
    },
    highlightMode: game.settings.get("auraeffects", "highlightMode"),
    levels: [token.level],
    locked: true,
    name: effect.name,
    restriction,
    shapes: [{
      type: "emanation",
      base: {
        type: "token",
        x: token._source.x,
        y: token._source.y,
        width: token._source.width,
        height: token._source.height,
        shape: token._source.shape
      },
      gridBased: true,
      hole: false,
      radius: token.parent.dimensions.distancePixels * effect.system.distance
    }],
    visibility: effect.system.showRadius ? CONST.REGION_VISIBILITY.ALWAYS : CONST.REGION_VISIBILITY.LAYER_UNLOCKED
  };
  return regionData;
}

export {
  getActorTokens,
  getActiveAuraEffects,
  getAuraRegions,
  getExtendedParts,
  getFormSystemData,
  getExtendedTabs,
  removeAndReplaceAuras,
  updateAllAuraRegions,
  refreshConditionalAuras,
  refreshSceneAuras,
  syncAppliedAuras,
  auraShouldApply
};