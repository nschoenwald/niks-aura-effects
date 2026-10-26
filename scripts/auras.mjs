import AuraActiveEffectDataMixin from "./AuraActiveEffectData.mjs";
import AuraActiveEffectSheetMixin from "./AuraActiveEffectSheet.mjs";
import { auraShouldApply, getActorTokens, getAuraRegions, getFormSystemData, refreshConditionalAuras, refreshSceneAuras, removeAndReplaceAuras, syncAppliedAuras, updateAllAuraRegions } from "./helpers.mjs";
import { applyAuraEffects, deleteEffects, updateAppliedEffects, updateRegionsForToken } from "./queries.mjs";
import { registerSettings } from "./settings.mjs";
import { migrate } from "./migrations.mjs";
import { api } from "./api.mjs";
import { registerDnd5eHooks } from "./systems/dnd5e.mjs";

/** @import { ActiveEffect, TokenDocument, User } from "@client/documents/_module.mjs"; */

// Track whether the "with no GM this no work" warning has been seen
let seenWarning = false;

// Track whether to mix the base effect type
let mixBase = true;

// Token fields which can affect an emitting token's aura regions
const REGION_AFFECTING_KEYS = ["x", "y", "elevation", "width", "height", "shape", "level", "hidden", "actorId", "actorLink", "delta"];

/**
 * A small helper function to determine whether an active GM is present and warn the user if not
 * @returns {User}
 */
function checkActiveGM() {
  const activeGM = game.users.activeGM;
  if (!activeGM && !seenWarning) {
    ui.notifications.warn("AURAEFFECTS.NoActiveGM", { localize: true });
    seenWarning = true;
  }
  return activeGM;
}


/**
 * Provided the arguments for the createToken hook, checks whether any auras should be applied & applies if so
 * @param {TokenDocument} token   The token being created
 * @param {Object} options        Additional options
 * @param {String} userId         The initiating User's ID
 */
async function createToken(token, options, userId) {
  // Exit early for non-initiators, or if no active GM
  if (game.user.id !== userId) return;
  if (!token.actor) return;
  const activeGM = checkActiveGM();
  if (!activeGM) return;
  await updateAllAuraRegions(token);
  const toApply = getAuraRegions(token)
    .reduce((acc, region) => {
      const effect = fromUuidSync(region.getFlag("auraeffects", "origin"));
      if (!effect) return acc;
      if (!auraShouldApply(effect, token)) return acc;
      acc.push(effect.uuid);
      return acc;
    }, []);
  if (toApply.length) await activeGM.query("auraeffects.applyAuraEffects", {[token.actor.uuid]: toApply});
}

/**
 * Provided the arguments for the updateToken hook, checks whether any updates should cause a change in
 * auras (e.g. a token becoming hidden or un-hidden) and applies those changes
 * @param {TokenDocument} token     The token being updated
 * @param {Object} updates          The updates
 * @param {Object} options          Additional options
 * @param {string} userId           The initiating User's ID
 */
async function updateToken(token, updates, options, userId) {
  // Exit early for non-initiators, or if no active GM
  if (game.user.id !== userId) return;
  if (!token.actor) return;
  const activeGM = checkActiveGM();
  if (!activeGM) return;
  // Skip e.g. region membership updates, which core issues for every token whenever any region changes
  if (REGION_AFFECTING_KEYS.some(k => k in updates)) await updateAllAuraRegions(token);
  await refreshConditionalAuras(token);

  // Disposition change
  if ("disposition" in updates) {
    const appliedAuras = token.actor.effects.filter(e => e.getFlag("auraeffects", "fromAura"));
    const [toApply, toRemove] = getAuraRegions(token)
      .map(r => fromUuidSync(r.getFlag("auraeffects", "origin")))
      .reduce((acc, effect) => {
        if (!effect) return acc;
        if (auraShouldApply(effect, token)) acc[0].push(effect.uuid);
        else {
          // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
          const appliedAura = appliedAuras.find(e => {
            const fromAura = e.getFlag("auraeffects", "fromAura");
            if (!fromAura) return false;
            return [fromAura, e.origin].includes(effect.uuid);
          });
          if (appliedAura) acc[1].push(appliedAura);
        }
        return acc;
      }, [[], []]);
    if (toApply.length) await activeGM.query("auraeffects.applyAuraEffects", {[token.actor.uuid]: toApply});
    await removeAndReplaceAuras(toRemove, token.parent);
  }
  
  // Regions change
  const priorRegionIds = options._priorRegions?.[token.id];
  if (!priorRegionIds) return;
  const oldRegions = priorRegionIds.map(i => token.parent.regions.get(i)).filter(r => r && !token.regions.has(r));
  const originsToRemove = new Set(oldRegions.map(r => r.getFlag("auraeffects", "origin")))
  // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
  const toRemove = token.actor.effects.contents.filter(e => {
    const fromAura = e.getFlag("auraeffects", "fromAura");
    if (!fromAura) return false;
    return originsToRemove.has((fromAura === true) ? e.origin : fromAura);
  });
  await removeAndReplaceAuras(toRemove, token.parent);
  const toApply = getAuraRegions(token)
    .filter(r => !priorRegionIds.includes(r.id))
    .map(r => fromUuidSync(r.getFlag("auraeffects", "origin")))
    .filter(e => e && auraShouldApply(e, token))
    .map(e => e.uuid);
  if (toApply.length) await activeGM.query("auraeffects.applyAuraEffects", {[token.actor.uuid]: toApply});
}

/**
 * Provided the arguments for the createActiveEffect or deleteActiveEffect hooks, check whether any updates should
 * cause a change in auras and applies those changes
 * @param {ActiveEffect} effect   The effect being created or deleted
 * @param {Object} options        Additional options
 * @param {String} userId         The initiating User's ID
 */
async function addRemoveEffect(effect, options, userId) {
  if (!effect.modifiesActor || !(effect.target instanceof Actor)) return;
  // Avoid calling this every time we add/remove an aura effect. Might miss some weird conditionals, but saves time
  if (foundry.utils.hasProperty(effect, 'flags.auraeffects.fromAura')) return;
  // Exit early for non-initiators or if no active GM
  if (game.user.id !== userId) return;
  const tokens = getActorTokens(effect.target);
  if (!tokens.length) return;
  if (!checkActiveGM()) return;
  for (const token of tokens) {
    await updateAllAuraRegions(token);
    await refreshConditionalAuras(token);
  }
}

/**
 * Provided the arguments for the updateActiveEffect hook. For a source aura effect, removes any child effects on the
 * scene or adds to the proper tokens, depending on whether the effect was enabled or disabled, and brings existing
 * child effects up to date. For any other effect, refreshes conditional auras of the affected actor.
 * @param {ActiveEffect} effect     The effect being updated
 * @param {Object} updates          The updates
 * @param {Object} options          Additional options
 * @param {String} userId           The initiating User's ID
 */
async function updateActiveEffect(effect, updates, options, userId) {
  if (game.user.id !== userId) return;
  if (effect.type !== "auraeffects.aura") {
    // Child effects are kept in sync by this module, so they can't change any conditionals
    if (foundry.utils.hasProperty(effect, "flags.auraeffects.fromAura")) return;
    if (!(effect.target instanceof Actor)) return;
    const tokens = getActorTokens(effect.target);
    if (!tokens.length) return;
    if (!checkActiveGM()) return;
    for (const token of tokens) await refreshConditionalAuras(token);
    return;
  }
  const actor = (effect.parent instanceof Actor) ? effect.parent : effect.parent?.parent;
  const tokens = getActorTokens(actor);
  if (!tokens.length) return;
  if (!checkActiveGM()) return;
  for (const token of tokens) {
    await updateAllAuraRegions(token);
    await syncAppliedAuras(effect, token);
    await refreshConditionalAuras(token);
  }
}

/**
 * Provided the arguments for the deleteRegion hook, removes any child effects on the scene that share the origin
 * aura effect of that region
 * @param {RegionDocument} region The region being deleted
 * @param {Object} options        Additional options
 * @param {Object} userId         The initiating User's ID
 */
async function deleteRegion(region, options, userId) {
  if (game.user.id !== userId) return;
  const originUuid = region.getFlag("auraeffects", "origin");
  if (!originUuid) return;
  if (!region.parent) return;
  if (!checkActiveGM()) return;
  // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
  const toRemove = Array.from(region.tokens).map(t => t.actor?.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(originUuid))).filter(Boolean);
  await removeAndReplaceAuras(toRemove, region.parent);
}

/**
 * Provided the arguments for the deleteToken hook, removes auras the token's linked actor received on that scene.
 * Regions attached to the token are deleted by core, which the deleteRegion hook handles.
 * @param {TokenDocument} token   The token being deleted
 * @param {Object} options        Additional options
 * @param {String} userId         The initiating User's ID
 */
async function deleteToken(token, options, userId) {
  if (game.user.id !== userId) return;
  // Unlinked actors are deleted along with their token
  if (!token.actorLink || !token.actor) return;
  if (!checkActiveGM()) return;
  // Keep auras which another token of the same actor is still within
  const otherTokens = token.parent.tokens.filter(t => t.actor === token.actor);
  const originsToRemove = new Set(getAuraRegions(token)
    .filter(r => !otherTokens.some(t => t.regions.has(r)))
    .map(r => r.getFlag("auraeffects", "origin")));
  // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
  const toRemove = token.actor.effects.filter(e => {
    const fromAura = e.getFlag("auraeffects", "fromAura");
    if (!fromAura) return false;
    return originsToRemove.has((fromAura === true) ? e.origin : fromAura);
  });
  if (toRemove.length) await removeAndReplaceAuras(toRemove, token.parent);
}

/**
 * Provided the arguments for the updateActor hook, refresh aura regions (e.g. for roll data-based distances) and any
 * conditional-having effects
 * @param {Actor} actor     The actor being updated
 * @param {Object} updates  The updates
 * @param {Object} options  Additional options
 * @param {String} userId   The initiating User's ID
 */
async function updateActor(actor, updates, options, userId) {
  if (game.user.id !== userId) return;
  const tokens = getActorTokens(actor);
  if (!tokens.length) return;
  if (!checkActiveGM()) return;
  for (const token of tokens) {
    await updateAllAuraRegions(token);
    await refreshConditionalAuras(token);
  }
}

/**
 * Refresh auras for an actor whose embedded item changed. Effects on created or deleted items don't fire any
 * ActiveEffect hooks, and item updates (e.g. equipping) can change whether a transferred aura is suppressed.
 * @param {Item} item   The item which was created, updated, or deleted
 */
async function refreshForItem(item) {
  if (!(item.parent instanceof Actor)) return;
  const tokens = getActorTokens(item.parent);
  if (!tokens.length) return;
  if (!checkActiveGM()) return;
  const hasAura = item.effects.some(e => e.type === "auraeffects.aura");
  for (const token of tokens) {
    if (hasAura) await updateAllAuraRegions(token);
    await refreshConditionalAuras(token);
  }
}

/**
 * Provided the arguments for the createItem or deleteItem hooks, refresh auras of the owning actor
 * @param {Item} item         The item being created or deleted
 * @param {Object} options    Additional options
 * @param {String} userId     The initiating User's ID
 */
async function addRemoveItem(item, options, userId) {
  if (game.user.id !== userId) return;
  await refreshForItem(item);
}

/**
 * Provided the arguments for the updateItem hook, refresh auras of the owning actor
 * @param {Item} item         The item being updated
 * @param {Object} updates    The updates
 * @param {Object} options    Additional options
 * @param {String} userId     The initiating User's ID
 */
async function updateItem(item, updates, options, userId) {
  if (game.user.id !== userId) return;
  await refreshForItem(item);
}

/**
 * Provided the arguments for the updateScene hook, fully refresh auras on a scene which just became active, so that
 * auras applied on the previously active scene don't linger
 * @param {Scene} scene     The scene being updated
 * @param {Object} updates  The updates
 * @param {Object} options  Additional options
 * @param {String} userId   The initiating User's ID
 */
async function updateScene(scene, updates, options, userId) {
  if (!("active" in updates) || !scene.active) return;
  // Only GMs can activate scenes; let the active GM do the work regardless of who activated it
  if (!game.user.isActiveGM) return;
  await refreshSceneAuras(scene);
}

/**
 * On combatant creation/deletion, refresh all auras to account for combat-only auras, and conditional auras just in case
 * @param {Combatant} combatant The combatant being created or deleted
 * @param {Object} options      Additional options
 * @param {String} userId       The initiating User's ID
 */
async function addRemoveCombatant(combatant, options, userId) {
  if (game.user.id !== userId) return;
  if (!combatant.token) return;
  if (!checkActiveGM()) return;
  await updateAllAuraRegions(combatant.token);
  await refreshConditionalAuras(combatant.token);
}

/**
 * On combat deletion, refresh auras & update conditionals for all combatants who were part of the combat
 * @param {Combat} combat   The combat being deleted
 * @param {Object} options  Additional options
 * @param {String} userId   The initiating User's ID
 */
async function deleteCombat(combat, options, userId) {
  if (game.user.id !== userId) return;
  if (!checkActiveGM()) return;
  for (const combatant of combat.combatants) {
    if (!combatant.token) continue;
    await updateAllAuraRegions(combatant.token);
  }

  // Split this into its own loop to avoid refreshing auras which may be removed in the above loop
  for (const combatant of combat.combatants) {
    if (!combatant.token) continue;
    await refreshConditionalAuras(combatant.token);
  }
}

/**
 * Provided the arguments for the updateCombat hook, refresh any conditional-having effects for combatants if round/turn changed
 * @param {Actor} combat    The actor being updated
 * @param {Object} updates  The updates
 * @param {Object} options  Additional options
 * @param {String} userId   The initiating User's ID
 */
async function updateCombat(combat, updates, options, userId) {
  if (game.user.id !== userId) return;
  if (!("round" in updates) && !("turn" in updates)) return;
  if (!checkActiveGM()) return;
  for (const combatant of combat.combatants) {
    if (!combatant.token) continue;
    await refreshConditionalAuras(combatant.token);
  }
}

/**
 * Injects a button to transform the effect into an "Aura Active Effect" when the AE Config sheet is rendered
 * @param {ActiveEffectConfig} app  The Active Effect Config sheet being rendered
 * @param {HTMLElement} html        The HTML Element
 */
function injectAuraButton(app, html) {
  const typesToInjectOn = ["base"];
  if (!typesToInjectOn.includes(app.document.type)) return;
  const template = document.createElement("template");
  template.innerHTML = `
    <div class="form-group">
      <label>Aura Effects</label>
      <div class="form-fields">
        <button type="button" data-tooltip="AURAEFFECTS.ConvertToAuraHint">
          <i class="fa-solid fa-person-rays"></i>
          ${_loc("AURAEFFECTS.ConvertToAura")}
        </button>
      </div>
    </div>
  `;
  const element = template.content.children[0];
  html.querySelector(".tab[data-tab=details]")?.insertAdjacentElement("beforeend", element);
  element.querySelector("button")?.addEventListener("click", () => {
    const currType = app.document.type;
    const updates = app._processFormData(null, app.form, new foundry.applications.ux.FormDataExtended(app.form));
    updates.type = "auraeffects.aura";
    foundry.utils.setProperty(updates, "flags.auraeffects.originalType", currType);
    // Keep any unsaved edits from the form on top of the stored system data
    updates.system = _replace(foundry.utils.mergeObject(app.document.toObject().system, {
      ...getFormSystemData(updates),
      showRadius: game.settings.get("auraeffects", "defaultVisibility")
    }, { inplace: false }));
    return app.document.update(updates);
  });
}

function registerHooks() {
  // Effect application/removal-specific hooks
  Hooks.on("createToken", createToken);
  Hooks.on("updateToken", updateToken);
  Hooks.on("deleteToken", deleteToken);
  Hooks.on("createActiveEffect", addRemoveEffect);
  Hooks.on("deleteActiveEffect", addRemoveEffect);
  Hooks.on("updateActiveEffect", updateActiveEffect);
  Hooks.on("deleteRegion", deleteRegion);
  Hooks.on("updateActor", updateActor);
  Hooks.on("createItem", addRemoveItem);
  Hooks.on("deleteItem", addRemoveItem);
  Hooks.on("updateItem", updateItem);
  Hooks.on("updateScene", updateScene);
  Hooks.on("createCombatant", addRemoveCombatant);
  Hooks.on("deleteCombatant", addRemoveCombatant);
  Hooks.on("deleteCombat", deleteCombat);
  Hooks.on("updateCombat", updateCombat);

  // UI hooks
  Hooks.on("renderActiveEffectConfig", injectAuraButton);

  // System-specific hooks
  switch (game.system.id) {
    case "dnd5e": 
      registerDnd5eHooks();
      break;
  }
}

function registerQueries() {
  CONFIG.queries["auraeffects.deleteEffects"] = deleteEffects;
  CONFIG.queries["auraeffects.applyAuraEffects"] = applyAuraEffects;
  CONFIG.queries["auraeffects.updateAppliedEffects"] = updateAppliedEffects;
  CONFIG.queries["auraeffects.updateRegionsForToken"] = updateRegionsForToken;
}

function registerAuraType() {
  const defaultClass = foundry.data.ActiveEffectTypeDataModel;
  const baseClass = CONFIG.ActiveEffect.dataModels.base;
  const acceptableOverlapKeys = Object.keys(defaultClass.defineSchema());
  const origSchemaKeys = Object.keys(baseClass.defineSchema());
  const auraSchemaKeys = Object.keys(AuraActiveEffectDataMixin(defaultClass).defineSchema());
  mixBase = !auraSchemaKeys.some(k => origSchemaKeys.includes(k) && !acceptableOverlapKeys.includes(k));
  Object.assign(CONFIG.ActiveEffect.dataModels, {
    "auraeffects.aura": AuraActiveEffectDataMixin(mixBase ? baseClass : defaultClass)
  });
}

function registerAuraSheet() {
  const defaultAESheet = Object.values(CONFIG.ActiveEffect.sheetClasses.base).find(d => d.default)?.cls;
  const sheetToMix = (mixBase && defaultAESheet) ? defaultAESheet : foundry.applications.sheets.ActiveEffectConfig;
  const AuraActiveEffectSheet = AuraActiveEffectSheetMixin(sheetToMix);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(ActiveEffect, "auraeffects", AuraActiveEffectSheet, {
    label: "AURAEFFECTS.SHEETS.AuraActiveEffectSheet",
    types: ["auraeffects.aura"],
    makeDefault: true
  });
}

Hooks.once("init", () => {
  registerHooks();
  registerQueries();
  registerAuraType();
  registerSettings();
});

Hooks.once("ready", () => {
  registerAuraSheet();
  game.modules.get("auraeffects").api = api;
  if (game.user.isActiveGM) {
    if (!mixBase && !game.settings.get("auraeffects", "seenSystemWarning")) {
      ChatMessage.implementation.create({
        speaker: {
          alias: "Aura Effects"
        },
        whisper: [game.user],
        content: _loc("AURAEFFECTS.PotentialSystemIncompatibility")
      });
      game.settings.set("auraeffects", "seenSystemWarning", true);
    }
    migrate();
    // Catch up on anything that changed while no GM was around to process it
    if (game.scenes.active) refreshSceneAuras(game.scenes.active);
  }
});