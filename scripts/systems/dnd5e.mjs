import { DISPOSITIONS } from "../constants.mjs";
import { canReceiveAuras, getActorTokens, getActiveAuraEffects, removeAndReplaceAuras } from "../helpers.mjs";

/** @import { Actor, ActiveEffect, Item } from "@client/documents/_module.mjs" */

/**
 * The aura is inactive while the paladin has one of these conditions (Incapacitated, and every condition which
 * includes it, plus Dead)
 */
const PALADIN_AURA_SCRIPT = '!["dead", "incapacitated", "paralyzed", "petrified", "stunned", "unconscious"].some(status => sourceToken.actor.statuses.has(status))';

/** Identifier of the feature which widens the Aura of Protection to 30 feet */
const AURA_EXPANSION = "aura-expansion";

/** Distance once the paladin has Aura Expansion */
const EXPANDED_DISTANCE = "30";

/** Identifier of the Aura of Protection feature, whose aura effect carries the additions */
const AURA_OF_PROTECTION = "aura-of-protection";

/**
 * The paladin's Aura of Protection and the features working within it, by item identifier.
 * - `aura`: the feature's effects become aura effects with the Aura of Protection's area and suppression.
 * - `merge`: always-on additions. Their effects stay on the feature as the source of the changes, but no longer
 *   apply themselves; their changes, statuses and description are added to the Aura of Protection's aura effect.
 * `fallback` describes the effect to create for versions of the feature which come without one (e.g. the 2014 SRD
 * class features), named after the feature.
 * @type {Record<string, { mode: "aura"|"merge", bestFormula?: string, fallback?: object[] }>}
 */
const PALADIN_AURA_FEATURES = {
  [AURA_OF_PROTECTION]: {
    mode: "aura",
    bestFormula: "max(1, @abilities.cha.mod)",
    fallback: [{ key: "system.bonuses.abilities.save", value: "max(1, @abilities.cha.mod)" }]
  },
  "aura-of-courage": {
    mode: "merge",
    fallback: [{ key: "system.traits.ci.value", value: "frightened" }]
  },
  "aura-of-devotion": {
    mode: "merge",
    fallback: [{ key: "system.traits.ci.value", value: "charmed" }]
  },
  // Player's Handbook, Oath of the Ancients
  "aura-of-warding": { mode: "merge" },
  // World of Warcraft, Oath of the Ebon Blade
  "aura-of-deathly-endurance": {
    mode: "merge",
    fallback: [
      { key: "system.traits.dr.value", value: "cold" },
      { key: "system.traits.dr.value", value: "necrotic" },
      { key: "system.traits.dr.value", value: "psychic" }
    ]
  },
  // Player's Handbook, Oath of Glory capstone: a toggled effect granting Half Cover, kept as its own aura so it can
  // be switched on from the actor
  "smite-of-protection": { mode: "aura" },
  // Heroes of Faerûn, Oath of the Noble Genies: one toggled effect per damage type, kept as auras for the same reason
  "aura-of-elemental-shielding": { mode: "aura" }
};

export function registerDnd5eHooks() {
  Hooks.on("dnd5e.transformActor", onTransformation);
  Hooks.on("dnd5e.revertOriginalForm", onTransformation);
  Hooks.on("preCreateItem", onPreCreateItem);
  Hooks.on("preCreateActor", onPreCreateActor);
  Hooks.on("createItem", onPaladinFeatureChange);
  Hooks.on("deleteItem", onPaladinFeatureChange);
  Hooks.on("createActiveEffect", onAdditionEffectChange);
  Hooks.on("updateActiveEffect", onAdditionEffectChange);
  Hooks.on("deleteActiveEffect", onAdditionEffectChange);
}

export function registerDnd5eSettings() {
  game.settings.register("auraeffects", "paladinAuras", {
    name: "AURAEFFECTS.SETTINGS.PaladinAuras.Name",
    hint: "AURAEFFECTS.SETTINGS.PaladinAuras.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

/**
 * On transformation, nuke any downstream effects
 * @param {Actor} actor
 */
async function onTransformation(actor) {
  const [sourceToken] = getActorTokens(actor);
  if (!sourceToken) return;
  if (!game.users.activeGM) return;
  const activeSourceEffects = getActiveAuraEffects(actor, sourceToken);
  const toDelete = [];
  for (const sourceEffect of activeSourceEffects) {
    for (const token of sourceToken.parent.tokens) {
      if ((token === sourceToken) || !canReceiveAuras(token)) continue;
      // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
      const badEffect = token.actor?.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid));
      if (badEffect) toDelete.push(badEffect);
    }
  }
  if (toDelete.length) await removeAndReplaceAuras(toDelete, sourceToken.parent);
}

/* -------------------------------------------- */
/*  Paladin auras                               */
/* -------------------------------------------- */

/**
 * The paladin aura feature an item represents, if any
 * @param {Item} item
 * @returns {string|null}   The feature's identifier
 */
function getPaladinAuraFeature(item) {
  if (item.type !== "feat") return null;
  const identifier = item.identifier;
  return (identifier in PALADIN_AURA_FEATURES) ? identifier : null;
}

/**
 * The distance formulas this module writes, so that distances a user typed in are left alone
 * @returns {Set<string>}
 */
function getGeneratedDistances() {
  return new Set([EXPANDED_DISTANCE, getScaleDistance("aura"), getScaleDistance("aura-radius")]);
}

/**
 * A distance formula following the paladin class's aura scale value, 10 feet without one
 * @param {string} scaleId    Identifier of the class's scale value
 * @returns {string}
 */
function getScaleDistance(scaleId) {
  return `max(10, @scale.paladin.${scaleId})`;
}

/**
 * The Aura of Protection's distance formula for an actor: 30 feet with Aura Expansion, otherwise the paladin class's
 * aura scale value (`aura` in the 2024 class, `aura-radius` in the 2014 class), at least 10 feet
 * @param {Actor} actor
 * @returns {string}
 */
function getPaladinAuraDistance(actor) {
  if (actor.items.some(i => (i.type === "feat") && (i.identifier === AURA_EXPANSION))) return EXPANDED_DISTANCE;
  const paladin = actor.items.find(i => (i.type === "class") && (i.identifier === "paladin"));
  const advancements = Object.values(paladin?._source.system.advancement ?? {});
  const hasLegacyScale = advancements.some(a => (a.type === "ScaleValue") && (a.configuration?.identifier === "aura-radius"));
  return getScaleDistance(hasLegacyScale ? "aura-radius" : "aura");
}

/**
 * Aura settings for an effect of a paladin aura feature
 * @param {string} feature    The feature's identifier
 * @param {Actor} actor       The actor owning the feature
 * @returns {object}          System data of the aura effect
 */
function getPaladinAuraSystem(feature, actor) {
  return {
    applyToSelf: true,
    bestFormula: PALADIN_AURA_FEATURES[feature].bestFormula ?? "",
    disposition: DISPOSITIONS.FRIENDLY,
    distanceFormula: getPaladinAuraDistance(actor),
    // Change values like the Charisma bonus refer to the paladin, not to the creature receiving the aura
    evaluatePreApply: true,
    script: PALADIN_AURA_SCRIPT,
    showRadius: game.settings.get("auraeffects", "defaultVisibility")
  };
}

/**
 * Set up an item's effects for a paladin aura feature: auras for `aura` features, inactive carriers of the changes
 * for `merge` features. Effects which already are auras are left as they are, so that customized auras survive
 * being copied to another actor.
 * @param {object} itemData   Source data of the item, modified in place
 * @param {string} feature    The feature's identifier
 * @param {Actor} actor       The actor owning the item
 * @returns {{ converted: object[], created: object[], unlinked: Record<string, object[]> }|null}
 *   The changed and created effects and the changed effect lists of activities; null if nothing changed
 */
function configurePaladinAuraData(itemData, feature, actor) {
  const { mode, fallback } = PALADIN_AURA_FEATURES[feature];
  const isAura = mode === "aura";
  const system = isAura ? getPaladinAuraSystem(feature, actor) : {};
  const effects = itemData.effects ?? [];
  const converted = [];
  const created = [];
  for (const effect of effects) {
    if (effect.type === "auraeffects.aura") continue;
    if (!isAura) {
      // Already a carrier
      if (effect.flags?.auraeffects?.paladinAura && !effect.transfer) continue;
      foundry.utils.mergeObject(effect, { transfer: false, flags: { auraeffects: { paladinAura: feature } } });
    } else {
      foundry.utils.mergeObject(effect, {
        type: "auraeffects.aura",
        transfer: true,
        system: foundry.utils.deepClone(system),
        flags: { auraeffects: { paladinAura: feature, originalType: effect.type ?? "base" } }
      });
    }
    converted.push(effect);
  }
  if (!effects.length && fallback) {
    const changes = fallback.map(c => ({ ...c, type: "add" }));
    const effect = isAura ? {
      name: itemData.name,
      img: itemData.img,
      type: "auraeffects.aura",
      transfer: true,
      system: { ...system, changes },
      flags: { auraeffects: { paladinAura: feature, originalType: "base" } }
    } : {
      name: itemData.name,
      img: itemData.img,
      type: "base",
      transfer: false,
      system: { changes },
      flags: { auraeffects: { paladinAura: feature } }
    };
    effects.push(effect);
    created.push(effect);
  }
  if (!converted.length && !created.length) return null;
  itemData.effects = effects;

  // Activities applying one of these effects to a target would duplicate what the aura gives (or, for an aura
  // effect, make the target a second aura source)
  const convertedIds = new Set(converted.map(e => e._id).filter(Boolean));
  const unlinked = {};
  for (const [id, activity] of Object.entries(itemData.system?.activities ?? {})) {
    if (!activity.effects?.some(e => convertedIds.has(e._id))) continue;
    activity.effects = activity.effects.filter(e => !convertedIds.has(e._id));
    unlinked[id] = activity.effects;
  }
  return { converted, created, unlinked };
}

/* -------------------------------------------- */
/*  Merging additions into Aura of Protection   */
/* -------------------------------------------- */

/**
 * @typedef PaladinAuraAddition
 * @property {string} name          Name of the feature
 * @property {string} description   The feature's description (HTML)
 * @property {object[]} effects     Source data of the feature's enabled carrier effects
 */

/**
 * The additions to merge into the Aura of Protection, from item source data
 * @param {object[]} itemsData    Source data of the actor's items
 * @returns {PaladinAuraAddition[]}
 */
function getAdditions(itemsData) {
  const additions = [];
  for (const itemData of itemsData) {
    const feature = itemData.flags?.auraeffects?.paladinAuraFeature;
    if (PALADIN_AURA_FEATURES[feature]?.mode !== "merge") continue;
    const effects = (itemData.effects ?? []).filter(e => (e.type !== "auraeffects.aura") && !e.disabled
      && (e.flags?.auraeffects?.paladinAura === feature));
    if (!effects.length) continue;
    additions.push({ name: itemData.name, description: itemData.system?.description?.value ?? "", effects });
  }
  return additions;
}

/**
 * Source data of an actor's items, each marked with the paladin aura feature it represents
 * @param {Iterable<Item>} items
 * @returns {object[]}
 */
function getItemsData(items) {
  return Array.from(items, item => {
    const itemData = item.toObject();
    foundry.utils.setProperty(itemData, "flags.auraeffects.paladinAuraFeature", getPaladinAuraFeature(item));
    return itemData;
  });
}

/**
 * A feature's description for the merged aura: a heading with its name and its rules text, without secret
 * sections (e.g. "Foundry Note")
 * @param {string} name
 * @param {string} description
 * @returns {string}
 */
function getDescriptionSection(name, description) {
  const text = (description ?? "").replace(/<section[^>]*class="[^"]*\bsecret\b[^"]*"[^>]*>[\s\S]*?<\/section>/g, "").trim();
  return `<h4>${foundry.utils.escapeHTML(name)}</h4>${text}`;
}

function isSameChange(a, b) {
  return (a.key === b.key) && (String(a.value) === String(b.value)) && ((a.type ?? "add") === (b.type ?? "add"));
}

/**
 * Compute the Aura of Protection effect with the additions merged in. What was merged before is taken out first, so
 * that edits a user made to the effect itself are kept.
 * @param {object} effectData             Source data of the Aura of Protection's aura effect
 * @param {object} protectionData         Source data of the Aura of Protection item
 * @param {PaladinAuraAddition[]} additions
 * @returns {object|null}                 Update data for the effect; null if nothing changes
 */
function getMergedProtectionUpdate(effectData, protectionData, additions) {
  const previous = effectData.flags?.auraeffects?.paladinAuraMerged ?? {};
  const currentChanges = effectData.system?.changes ?? [];
  const currentStatuses = effectData.statuses ?? [];
  const currentDescription = effectData.description ?? "";

  // The effect without the previous additions
  const changes = [...currentChanges];
  for (const merged of previous.changes ?? []) {
    const index = changes.findIndex(c => isSameChange(c, merged));
    if (index >= 0) changes.splice(index, 1);
  }
  const statuses = currentStatuses.filter(s => !previous.statuses?.includes(s));
  let description = currentDescription;
  if (previous.description && description.includes(previous.description)) {
    description = description.replace(previous.description, "");
  }

  // The current additions
  const merged = { changes: [], statuses: [], description: "" };
  for (const { effects } of additions) {
    for (const effect of effects) {
      merged.changes.push(...foundry.utils.deepClone(effect.system?.changes ?? []));
      for (const status of effect.statuses ?? []) {
        if (!statuses.includes(status) && !merged.statuses.includes(status)) merged.statuses.push(status);
      }
    }
  }
  if (additions.length) {
    const sections = [getDescriptionSection(protectionData.name, protectionData.system?.description?.value)];
    for (const addition of additions) {
      const ownText = addition.effects.map(e => e.description ?? "").filter(d => d.trim()).join("");
      sections.push(getDescriptionSection(addition.name, ownText || addition.description));
    }
    merged.description = sections.join("");
  }

  const update = {
    "system.changes": [...changes, ...merged.changes],
    statuses: [...statuses, ...merged.statuses],
    description: description + merged.description,
    "flags.auraeffects.paladinAuraMerged": merged
  };
  const unchanged = (JSON.stringify(update["system.changes"]) === JSON.stringify(currentChanges))
    && (JSON.stringify(update.statuses) === JSON.stringify(currentStatuses))
    && (update.description === currentDescription)
    && (JSON.stringify(merged) === JSON.stringify(previous));
  return unchanged ? null : update;
}

/**
 * Find the Aura of Protection's aura effect among item source data
 * @param {object[]} itemsData
 * @returns {{ itemData: object, effectData: object }|null}
 */
function findProtectionAura(itemsData) {
  for (const itemData of itemsData) {
    if (itemData.flags?.auraeffects?.paladinAuraFeature !== AURA_OF_PROTECTION) continue;
    const effectData = itemData.effects?.find(e => (e.type === "auraeffects.aura")
      && (e.flags?.auraeffects?.paladinAura === AURA_OF_PROTECTION));
    if (effectData) return { itemData, effectData };
  }
  return null;
}

/**
 * Merge the additions into the Aura of Protection within item source data, modifying it in place
 * @param {object[]} itemsData    Source data of all the actor's items, marked by getItemsData
 * @returns {boolean}             Whether anything changed
 */
function mergeProtectionData(itemsData) {
  const protection = findProtectionAura(itemsData);
  if (!protection) return false;
  const update = getMergedProtectionUpdate(protection.effectData, protection.itemData, getAdditions(itemsData));
  if (!update) return false;
  for (const [key, value] of Object.entries(update)) foundry.utils.setProperty(protection.effectData, key, value);
  return true;
}

/**
 * Bring an actor's Aura of Protection effect up to date with the additions the actor has
 * @param {Actor} actor
 */
async function syncProtectionAura(actor) {
  const itemsData = getItemsData(actor.items);
  const protection = findProtectionAura(itemsData);
  if (!protection) return;
  const update = getMergedProtectionUpdate(protection.effectData, protection.itemData, getAdditions(itemsData));
  if (!update) return;
  update["flags.auraeffects.paladinAuraMerged"] = _replace(update["flags.auraeffects.paladinAuraMerged"]);
  const effect = actor.items.get(protection.itemData._id)?.effects.get(protection.effectData._id);
  await effect?.update(update);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * When a paladin aura feature is added to an actor, set up its effects. Aura of Protection takes in the additions
 * the actor already has; additions gained later are merged in by onPaladinFeatureChange.
 * @param {Item} item         The item being created
 * @param {object} data       The initial creation data
 * @param {object} options    Additional options
 * @param {string} userId     The initiating User's ID
 */
function onPreCreateItem(item, data, options, userId) {
  if ((game.user.id !== userId) || !(item.parent instanceof Actor)) return;
  if (!game.settings.get("auraeffects", "paladinAuras")) return;
  const feature = getPaladinAuraFeature(item);
  if (!feature) return;
  const [itemData] = getItemsData([item]);
  const result = configurePaladinAuraData(itemData, feature, item.parent);
  let merged = false;
  if (feature === AURA_OF_PROTECTION) merged = mergeProtectionData([itemData, ...getItemsData(item.parent.items)]);
  if (!result && !merged) return;
  const update = { effects: itemData.effects };
  for (const [id, effects] of Object.entries(result?.unlinked ?? {})) update[`system.activities.${id}.effects`] = effects;
  item.updateSource(update);
}

/**
 * When an actor is created with paladin aura features (e.g. imported from a compendium), set up their effects
 * @param {Actor} actor       The actor being created
 * @param {object} data       The initial creation data
 * @param {object} options    Additional options
 * @param {string} userId     The initiating User's ID
 */
function onPreCreateActor(actor, data, options, userId) {
  if (game.user.id !== userId) return;
  if (!game.settings.get("auraeffects", "paladinAuras")) return;
  const itemsData = getItemsData(actor.items);
  let changed = false;
  for (const itemData of itemsData) {
    const feature = itemData.flags.auraeffects.paladinAuraFeature;
    if (feature && configurePaladinAuraData(itemData, feature, actor)) changed = true;
  }
  if (mergeProtectionData(itemsData)) changed = true;
  if (!changed) return;
  for (const itemData of itemsData) delete itemData.flags.auraeffects.paladinAuraFeature;
  actor.updateSource({ items: itemsData });
}

/**
 * When an actor gains or loses Aura Expansion, resize the paladin auras whose distance this module set. When it
 * gains or loses an addition, update the Aura of Protection.
 * @param {Item} item         The item which was created or deleted
 * @param {object} options    Additional options
 * @param {string} userId     The initiating User's ID
 */
async function onPaladinFeatureChange(item, options, userId) {
  if ((game.user.id !== userId) || !(item.parent instanceof Actor)) return;
  if (item.type !== "feat") return;
  const actor = item.parent;
  if (PALADIN_AURA_FEATURES[getPaladinAuraFeature(item)]?.mode === "merge") {
    await syncProtectionAura(actor);
    return;
  }
  if (item.identifier !== AURA_EXPANSION) return;
  const distanceFormula = getPaladinAuraDistance(actor);
  const generated = getGeneratedDistances();
  for (const owner of actor.items) {
    const updates = owner.effects
      .filter(e => (e.type === "auraeffects.aura") && e.getFlag("auraeffects", "paladinAura")
        && generated.has(e.system.distanceFormula) && (e.system.distanceFormula !== distanceFormula))
      .map(e => ({ _id: e.id, "system.distanceFormula": distanceFormula }));
    if (updates.length) await owner.updateEmbeddedDocuments("ActiveEffect", updates);
  }
}

/**
 * When the effect of an addition is created, edited, toggled or deleted, update the Aura of Protection
 * @param {ActiveEffect} effect   The effect
 * @param {...*} args             The hook's remaining arguments, ending with the initiating User's ID
 */
async function onAdditionEffectChange(effect, ...args) {
  const userId = args.at(-1);
  const options = args.at(-2);
  if ((game.user.id !== userId) || options?.auraeffectsSkipSync) return;
  if (effect.type === "auraeffects.aura") return;
  const item = effect.parent;
  if (!(item instanceof Item) || !(item.parent instanceof Actor)) return;
  if (PALADIN_AURA_FEATURES[getPaladinAuraFeature(item)]?.mode !== "merge") return;
  await syncProtectionAura(item.parent);
}

/**
 * Set up the paladin aura features an existing actor already has, as if they had just been added. Effects which
 * already are auras are left alone.
 * @param {Actor} actor
 * @returns {Promise<Item[]>}   The items which were changed
 */
export async function configurePaladinAuras(actor) {
  if (game.system.id !== "dnd5e") return [];
  const changedItems = [];
  for (const item of actor.items) {
    const feature = getPaladinAuraFeature(item);
    if (!feature) continue;
    const itemData = item.toObject();
    const result = configurePaladinAuraData(itemData, feature, actor);
    if (!result) continue;
    const activityUpdate = {};
    for (const [id, effects] of Object.entries(result.unlinked)) activityUpdate[`system.activities.${id}.effects`] = effects;
    if (!foundry.utils.isEmpty(activityUpdate)) await item.update(activityUpdate);
    // Keep the hooks from merging half-configured additions; the actor is synced once at the end
    if (result.converted.length) await item.updateEmbeddedDocuments("ActiveEffect", result.converted.map(e => ({
      _id: e._id,
      type: e.type,
      transfer: e.transfer,
      system: _replace(e.system),
      "flags.auraeffects": e.flags.auraeffects
    })), { auraeffectsSkipSync: true });
    if (result.created.length) await item.createEmbeddedDocuments("ActiveEffect", result.created, { auraeffectsSkipSync: true });
    changedItems.push(item);
  }
  await syncProtectionAura(actor);
  return changedItems;
}
