/** @import { ActiveEffect, Actor, Scene, TokenDocument } from "@client/documents/_module.mjs" */
/** @import { RegionData } from "@common/documents/_types.mjs" */

// Compiled conditional scripts, keyed by script source
const compiledScripts = new Map();

// Short-lived results of scene lookups, see memoize()
const memo = new Map();

/**
 * Remember the result of a lookup until the current task ends. Aura handlers ask the same questions (which scenes are
 * live, which scene is an actor's home) once per token in loops, while the answers only change between tasks: user
 * activity, scene activation and token changes all arrive as separate socket messages.
 * @param {string} key
 * @param {Function} fn
 * @returns {*}
 */
function memoize(key, fn) {
  if (memo.has(key)) return memo.get(key);
  if (!memo.size) setTimeout(() => memo.clear(), 0);
  const value = fn();
  memo.set(key, value);
  return value;
}

// Conditional scripts this module writes itself (automatic auras), which any client may run
const trustedScripts = new Set();

/**
 * Mark conditional scripts as safe to run on every client, e.g. the ones generated for automatic auras
 * @param {Iterable<string>} scripts
 */
function registerTrustedScripts(scripts) {
  for (const script of scripts) if (script?.trim()) trustedScripts.add(script.trim());
}

/**
 * Whether this client may run an aura's conditional script. A script is code: run on someone else's client it would
 * run with that user's rights (on the active GM's, with full rights). So a script runs everywhere only if this module
 * wrote it or no player can edit the effect (then a GM wrote it); otherwise only on the clients of its players.
 * @param {ActiveEffect} effect   The source aura effect
 * @param {string} script         The trimmed script
 * @returns {boolean}
 */
function canRunScript(effect, script) {
  if (trustedScripts.has(script)) return true;
  const editableByPlayer = game.users.some(u => !u.isGM && effect.testUserPermission(u, "OWNER"));
  if (!editableByPlayer) return true;
  return !game.user.isGM && effect.isOwner;
}

/**
 * Evaluate a formula synchronously, without throwing: dice and unknown terms don't stop it, and a formula which
 * can't be parsed gives the fallback (with a console warning)
 * @param {string} formula
 * @param {object} [rollData]
 * @param {number} [fallback=0]
 * @returns {number}
 */
function evaluateFormula(formula, rollData, fallback = 0) {
  try {
    const total = new Roll(formula, rollData).evaluateSync({ strict: false }).total;
    return Number.isFinite(total) ? total : fallback;
  } catch (err) {
    console.warn(`Aura Effects | Could not evaluate the formula "${formula}"`, err);
    return fallback;
  }
}

/**
 * Execute the script on an aura active effect for a given token, returning whether said token should receive
 * the effect or not
 * @param {TokenDocument} sourceToken   The aura-emanating token
 * @param {TokenDocument} token         The potential aura effect recipient token
 * @param {ActiveEffect} effect         The aura effect in question
 * @returns {boolean|null}              true if effect should be applied, false if not (including if the script
 *                                      errors), null if this client may not run the script (see canRunScript)
 */
function executeScript(sourceToken, token, effect) {
  const script = (effect.system.script ?? "").trim();
  if (!script.length) return true;
  if (!canRunScript(effect, script)) return null;
  const actor = token.actor;
  try {
    let compiled = compiledScripts.get(script);
    if (!compiled) {
      compiled = {
        fn: Function("actor", "token", "sourceToken", "rollData", `return Boolean(${script});`),
        // Roll data is a deep copy of the actor's data; only build it for scripts which use it
        usesRollData: /\brollData\b|\barguments\b/.test(script)
      };
      compiledScripts.set(script, compiled);
    }
    // Placeables only exist for the scene this client is viewing; fall back to the documents otherwise
    return compiled.fn(actor, token.object ?? token, sourceToken.object ?? sourceToken,
      compiled.usesRollData ? actor.getRollData() : undefined);
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
 * Get the scenes on which play currently happens: the active scene, then every scene a connected player is viewing.
 * Viewed scenes are tracked from user activity, which every client receives.
 * @returns {Scene[]}
 */
function getLiveScenes() {
  return memoize("liveScenes", () => {
    const ids = new Set();
    if (game.scenes?.active) ids.add(game.scenes.active.id);
    for (const user of game.users ?? []) {
      if (user.active && !user.isGM && user.viewedScene) ids.add(user.viewedScene);
    }
    return Array.from(ids, id => game.scenes.get(id)).filter(Boolean);
  });
}

/**
 * Get the scene whose auras a world actor's applied auras follow. Applied auras live on the actor and so show on every
 * scene, which means only one scene may decide them: of the live scenes holding a linked token of the actor, the one
 * a connected owning player is viewing, else the first (the active scene if it qualifies).
 * @param {Actor} actor   A world actor
 * @returns {Scene|null}
 */
function getHomeScene(actor) {
  return memoize(`homeScene.${actor.id}`, () => findHomeScene(actor));
}

/**
 * Find the home scene of a world actor, see getHomeScene
 * @param {Actor} actor
 * @returns {Scene|null}
 */
function findHomeScene(actor) {
  const candidates = getLiveScenes().filter(s => s.tokens.some(t => t.actorLink && (t.actorId === actor.id)));
  if (candidates.length < 2) return candidates[0] ?? null;
  const viewed = game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER")
    && candidates.some(s => s.id === u.viewedScene))?.viewedScene;
  return candidates.find(s => s.id === viewed) ?? candidates[0];
}

/**
 * Whether auras may be applied to or removed from a token's actor from the token's scene. Unlinked tokens have their
 * own actor, so any scene may. Linked tokens only may on their actor's home scene, so that moving tokens around a
 * scene being prepared doesn't change the characters in play.
 * @param {TokenDocument} token
 * @returns {boolean}
 */
function canReceiveAuras(token) {
  if (!token?.actor || !token.parent) return false;
  if (!token.actorLink) return true;
  return getHomeScene(token.actor) === token.parent;
}

/**
 * Get the tokens which represent an actor on the live scenes and on the scene this client is viewing (active scene
 * first). Unlike Actor#getActiveTokens, this doesn't depend solely on which scene the current user happens to view.
 * @param {Actor} actor
 * @returns {TokenDocument[]}
 */
function getActorTokens(actor) {
  if (!actor) return [];
  if (actor.isToken) return actor.token?.parent ? [actor.token] : [];
  // Remembered until the current task ends: the source aura's isSuppressed getter asks on every data preparation
  return memoize(`actorTokens.${actor.uuid}`, () => {
    const scenes = Array.from(new Set([...getLiveScenes(), canvas?.scene].filter(Boolean)));
    if (!scenes.length) return [];
    return actor.getDependentTokens({ scenes, concreteOnly: true });
  });
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
 * @returns {boolean|null}    null if its conditional script can't run on this client: then neither apply nor remove
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
  // Script doesn't pass, or can't run on this client (null: leave the token as it is)
  return executeScript(sourceToken, token, effect);
}

/**
 * Work out which auras to remove and which to apply in their place: non-stacking auras look for the "next-best" aura
 * of the same name among the aura regions the token is still in
 * @param {ActiveEffect[]} effects                    The applied copies which will be removed
 * @param {Scene} scene                               The scene on which to perform any necessary logic
 * @param {Object<string, string[]>} [toApply={}]     Further auras to apply: Actor UUIDs as keys, lists of source
 *                                                    ActiveEffect UUIDs as values
 * @returns {{remove: string[], apply: Object<string, string[]>}}
 */
function planRemoveAndReplace(effects, scene, toApply = {}) {
  effects = effects.filter(Boolean);
  const apply = {};
  for (const [actorUuid, uuids] of Object.entries(toApply)) (apply[actorUuid] ??= []).push(...uuids);

  const bestValues = new Map();
  const getBest = (effect, sourceToken) => {
    if (!bestValues.has(effect.uuid)) {
      const bestFormula = effect.system.bestFormula?.trim();
      // Sources without a formula rank last
      bestValues.set(effect.uuid, bestFormula
        ? evaluateFormula(bestFormula, sourceToken.actor.getRollData(), -Infinity) : -Infinity);
    }
    return bestValues.get(effect.uuid);
  };

  // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
  for (const effect of effects) {
    const fromAura = effect.getFlag("auraeffects", "fromAura");
    if (fromUuidSync((fromAura === true) ? effect.origin : fromAura, { strict: false })?.system?.canStack) continue;
    const targets = effect.parent.getDependentTokens({ scenes: scene, concreteOnly: true }).filter(canReceiveAuras);
    for (const targetToken of targets) {
      // Only auras whose region the token is in can apply; the region and its source must still be there and on
      const candidates = [];
      for (const region of getAuraRegions(targetToken)) {
        if (!scene.regions.has(region.id)) continue;
        const sourceToken = region.attachment.token;
        if (!sourceToken || !scene.tokens.has(sourceToken.id)) continue;
        const candidate = fromUuidSync(region.getFlag("auraeffects", "origin"), { strict: false });
        if (candidate?.type !== "auraeffects.aura") continue;
        if ((candidate.system.overrideName?.trim() || candidate.name) !== effect.name) continue;
        if (candidate.disabled || candidate.system.isSuppressedFor(sourceToken)) continue;
        candidates.push({ effect: candidate, best: getBest(candidate, sourceToken) });
      }
      candidates.sort((a, b) => b.best - a.best);
      const replacement = candidates.find(c => auraShouldApply(c.effect, targetToken) === true);
      if (replacement) (apply[targetToken.actor.uuid] ??= []).push(replacement.effect.uuid);
    }
  }
  return { remove: effects.map(e => e.uuid), apply };
}

/**
 * Remove specified auras, ensuring that any non-stacking auras perform a search for the "next-best" and apply it, if
 * present. Removals, replacements and the given additions go to the GM in one request, which makes them one batch for
 * every client.
 * @param {ActiveEffect[]} effects                    The effects which will be removed
 * @param {Scene} scene                               The scene on which to perform any necessary logic
 * @param {Object<string, string[]>} [toApply={}]     Further auras to apply: Actor UUIDs as keys, lists of source
 *                                                    ActiveEffect UUIDs as values
 */
async function removeAndReplaceAuras(effects, scene, toApply = {}) {
  const plan = planRemoveAndReplace(effects, scene, toApply);
  if (!plan.remove.length && foundry.utils.isEmpty(plan.apply)) return;
  return game.users.activeGM.query("auraeffects.modifyAuras", plan);
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
 * @param {TokenDocument} token                 A specified token document
 * @param {Object} [options]
 * @param {boolean} [options.reevaluate=true]   Re-check the tokens within the token's regions. Not needed when the
 *                                              token only moved: core then updates the membership of the tokens around
 *                                              it, and the updateToken hook applies or removes their auras.
 */
async function updateAllAuraRegions(token, { reevaluate = true } = {}) {
  const plan = planAuraRegions(token);
  if (!plan) return;
  const { toCreate, toUpdate, toDelete, retained } = plan;
  if (toCreate.length || toUpdate.length || toDelete.length) {
    // The GM works the changes out again from the token: region data from a client is never used
    await game.users.activeGM.query("auraeffects.updateRegionsForToken", { tokenUuid: token.uuid });
  }
  if (!reevaluate) return;
  // Re-evaluate tokens within retained regions, since the source effect's settings may have changed
  const toRemove = [];
  const toAdd = {};
  for (const [region, sourceEffect] of retained) {
    for (const currToken of region.tokens) {
      if (!canReceiveAuras(currToken)) continue;
      // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
      const currAppliedEffect = currToken.actor.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid));
      const shouldApply = auraShouldApply(sourceEffect, currToken);
      if (currAppliedEffect) {
        if (shouldApply === false) toRemove.push(currAppliedEffect);
      } else if (shouldApply === true) {
        (toAdd[currToken.actor.uuid] ??= []).push(sourceEffect.uuid);
      }
    }
  }
  await removeAndReplaceAuras(toRemove, token.parent, toAdd);
}

/**
 * Work out the aura regions a token should have attached: one per active source aura effect of its actor
 * @param {TokenDocument} token
 * @returns {{toCreate: object[], toUpdate: object[], toDelete: string[], retained: Array<[RegionDocument, ActiveEffect]>}|null}
 */
function planAuraRegions(token) {
  if (!token?.actor) return null;
  const activeSourceEffects = getActiveAuraEffects(token.actor, token);
  const attachedAuraRegions = Array.from(token.attachments.regions.filter(r => r.getFlag("auraeffects", "origin")));
  if (!activeSourceEffects.length && !attachedAuraRegions.length) return null;
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
  return { toCreate, toUpdate, toDelete, retained };
}

/**
 * Ensure all applied auras shouldn't be removed, and all non-applied auras shouldn't be applied
 * @param {TokenDocument} token 
 */
// TODO: Any way to keep this from always toggling between effects if prefer recent is on & both require conditionals?
async function refreshConditionalAuras(token) {
  if (!canReceiveAuras(token)) return;
  const toRemove = [];
  const toAdd = [];
  for (const region of getAuraRegions(token)) {
    const sourceEffect = fromUuidSync(region.getFlag("auraeffects", "origin"), { strict: false });
    // The origin may no longer be an aura (reverted with the sheet's Revert button) until its region is removed
    if ((sourceEffect?.type !== "auraeffects.aura") || !sourceEffect.system.script?.trim()) continue;
    // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
    const existingEffect = token.actor.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid));
    const shouldApply = auraShouldApply(sourceEffect, token);
    if (existingEffect && (shouldApply === false)) toRemove.push(existingEffect);
    else if (!existingEffect && (shouldApply === true)) toAdd.push(sourceEffect.uuid);
  }
  await removeAndReplaceAuras(toRemove, token.parent, toAdd.length ? { [token.actor.uuid]: toAdd } : {});
}

/**
 * Fully reconcile the auras applied to a token's actor against the aura regions on the token's scene: remove applied
 * auras whose source region the token isn't in (e.g. left over from another scene), and apply any that are missing
 * @param {TokenDocument} token
 * @param {Object} [options]
 * @param {Set<string>} [options.entered]   IDs of regions the token just entered. Their non-stacking auras may replace
 *                                          an applied one of the same name, by the usual "best" rules.
 */
async function refreshAllAuras(token, options) {
  const plan = planAllAuras(token, options);
  if (!plan || (!plan.remove.length && foundry.utils.isEmpty(plan.apply))) return;
  return game.users.activeGM.query("auraeffects.modifyAuras", plan);
}

/**
 * Work out the changes refreshAllAuras makes, without sending them
 * @param {TokenDocument} token
 * @param {Object} [options]
 * @param {Set<string>} [options.entered]
 * @returns {{remove: string[], apply: Object<string, string[]>, keep: string[]}|null}
 */
function planAllAuras(token, { entered = new Set() } = {}) {
  if (!token.parent?.tokens.has(token.id)) return null;
  if (!canReceiveAuras(token)) return null;
  const sceneAuraRegions = token.parent.regions.filter(r => r.getFlag("auraeffects", "origin"));
  const toRemove = [];
  const kept = [];
  // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
  for (const effect of token.actor.effects) {
    const fromAura = effect.getFlag("auraeffects", "fromAura");
    if (!fromAura) continue;
    const originUuid = (fromAura === true) ? effect.origin : fromAura;
    const originRegions = sceneAuraRegions.filter(r => r.getFlag("auraeffects", "origin") === originUuid);
    const sourceEffect = fromUuidSync(originUuid, { strict: false });
    if (sourceEffect && originRegions.some(r => token.regions.has(r))) {
      // A script this client may not run (null) keeps the copy
      if (auraShouldApply(sourceEffect, token) === false) toRemove.push(effect);
      else kept.push(effect);
    }
    // Region membership lags behind newly created or reshaped regions; the updateToken hook handles those
    else if (originRegions.some(r => token.testInsideRegion(r))) kept.push(effect);
    else toRemove.push(effect);
  }
  const keptNames = new Set(kept.map(e => e.name));
  const toAdd = [];
  for (const region of getAuraRegions(token)) {
    const sourceEffect = fromUuidSync(region.getFlag("auraeffects", "origin"), { strict: false });
    if (sourceEffect?.type !== "auraeffects.aura") continue;
    if (kept.some(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid))) continue;
    // Don't swap out an already-applied non-stacking aura of the same name
    if (!sourceEffect.system.canStack && !entered.has(region.id)
      && keptNames.has(sourceEffect.system.overrideName?.trim() || sourceEffect.name)) continue;
    if (auraShouldApply(sourceEffect, token) === true) toAdd.push(sourceEffect.uuid);
  }
  const plan = planRemoveAndReplace(toRemove, token.parent, toAdd.length ? { [token.actor.uuid]: toAdd } : {});
  plan.keep = kept.map(e => e.uuid);
  return plan;
}

/**
 * Rebuild all aura regions on the live scenes and fully reconcile every token's applied auras against them. World
 * actors without a linked token on any live scene lose all applied auras, since those can only stem from elsewhere.
 */
async function refreshLiveScenes() {
  const activeGM = game.users.activeGM;
  if (!activeGM) return;
  const scenes = getLiveScenes();
  // Without any scene in play there's nothing to reconcile against
  if (!scenes.length) return;
  const tokens = scenes.flatMap(s => s.tokens.filter(t => t.actor));
  // The reconcile below checks every token, so the regions don't need to re-check the tokens within them
  // One broken aura (e.g. a formula that can't be evaluated) must not stop the others
  for (const token of tokens) {
    try {
      await updateAllAuraRegions(token, { reevaluate: false });
    } catch (err) {
      console.error(`Aura Effects | Updating the aura regions of ${token.name} failed`, err);
    }
  }
  // Collect every token's changes and send them as one batch
  const remove = new Set();
  const keep = new Set();
  const apply = {};
  for (const token of tokens) {
    let plan;
    try {
      plan = planAllAuras(token);
    } catch (err) {
      console.error(`Aura Effects | Checking the auras of ${token.name} failed`, err);
      continue;
    }
    if (!plan) continue;
    plan.remove.forEach(uuid => remove.add(uuid));
    plan.keep.forEach(uuid => keep.add(uuid));
    for (const [actorUuid, uuids] of Object.entries(plan.apply)) (apply[actorUuid] ??= []).push(...uuids);
  }
  // Another token of the same actor may still be within an aura one token left
  for (const uuid of keep) remove.delete(uuid);
  const presentActorIds = new Set(tokens.filter(t => t.actorLink).map(t => t.actorId));
  for (const actor of game.actors) {
    if (presentActorIds.has(actor.id)) continue;
    for (const effect of actor.effects) if (effect.getFlag("auraeffects", "fromAura")) remove.add(effect.uuid);
  }
  for (const [actorUuid, uuids] of Object.entries(apply)) apply[actorUuid] = Array.from(new Set(uuids));
  if (remove.size || !foundry.utils.isEmpty(apply)) {
    await activeGM.query("auraeffects.modifyAuras", { remove: Array.from(remove), apply });
  }
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
  // Limit the aura to the token's height plus the radius above and below, like Foundry's own token emanations
  // (RegionDocument.createTokenEmanation). Foundry shifts this range along when the token changes elevation.
  // null means unlimited, the behaviour from before this was added.
  // Evaluated once: the distance formula builds the actor's roll data
  const distance = effect.system.distance;
  let elevation = { bottom: null, top: null };
  if (!game.settings.get("auraeffects", "ignoreElevation")) {
    const tokenElevation = token._source.elevation;
    const head = tokenElevation + (token._source.depth * token.parent.grid.distance);
    elevation = { bottom: tokenElevation - distance, top: head + distance };
  }
  const regionData = {
    attachment: {
      token: token.id
    },
    color: (effect.system.color ?? tokenOwner?.color)?.css,
    displayMeasurements: false,
    elevation,
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
      radius: token.parent.dimensions.distancePixels * distance
    }],
    visibility: effect.system.showRadius ? CONST.REGION_VISIBILITY.ALWAYS : CONST.REGION_VISIBILITY.LAYER_UNLOCKED
  };
  return regionData;
}

export {
  canReceiveAuras,
  evaluateFormula,
  planAuraRegions,
  registerTrustedScripts,
  getActorTokens,
  getHomeScene,
  getLiveScenes,
  getActiveAuraEffects,
  getAuraRegions,
  getExtendedParts,
  getFormSystemData,
  getExtendedTabs,
  removeAndReplaceAuras,
  updateAllAuraRegions,
  refreshConditionalAuras,
  refreshAllAuras,
  refreshLiveScenes,
  syncAppliedAuras,
  auraShouldApply
};