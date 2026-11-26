import { DISPOSITIONS } from "../constants.mjs";
import { canReceiveAuras, getActorTokens, getActiveAuraEffects, removeAndReplaceAuras } from "../helpers.mjs";

/** @import { Actor, ActiveEffect, Item } from "@client/documents/_module.mjs" */

/* -------------------------------------------- */
/*  Rules                                       */
/* -------------------------------------------- */

/** Conditions which switch an aura off: Incapacitated, every condition which includes it, and Dead */
const INACTIVE_STATUSES = '["dead", "incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]';

/** Conditional script: the aura's source can act */
const SOURCE_ACTIVE = `!${INACTIVE_STATUSES}.some(status => sourceToken.actor.statuses.has(status))`;

/** Conditional script: the creature receiving the aura can act */
const TARGET_ACTIVE = `!${INACTIVE_STATUSES}.some(status => actor.statuses.has(status))`;

/** Conditional script: the creature receiving the aura is an Undead */
const TARGET_UNDEAD = 'actor.system.details?.type?.value === "undead"';

/** Conditional script: the creature receiving the aura is a Beast */
const TARGET_BEAST = 'actor.system.details?.type?.value === "beast"';

/** Conditional script: the source has an Aura of Protection */
const SOURCE_HAS_PROTECTION = 'sourceToken.actor.items.some(i => i.identifier === "aura-of-protection")';

/** Identifier of the feature which widens the Aura of Protection to 30 feet */
const AURA_EXPANSION = "aura-expansion";

/** Distance once the paladin has Aura Expansion */
const EXPANDED_DISTANCE = "30";

/** Identifier of the Aura of Protection feature, whose aura effect carries the additions */
const AURA_OF_PROTECTION = "aura-of-protection";

/** Distance marker: the Aura of Protection's area */
const PROTECTION = "protection";

/** Keys the aura effect type adds to the system data */
const AURA_SYSTEM_KEYS = ["applyToSelf", "bestFormula", "canStack", "collisionType", "color", "combatOnly",
  "disableOnHidden", "distanceFormula", "disposition", "evaluatePreApply", "overrideName", "script", "showRadius"];

const advantage = key => ({ key, type: "dnd5e.advantage", value: 1 });
const add = (key, value) => ({ key, type: "add", value });
const hasChange = (effect, pattern) => (effect.system?.changes ?? []).some(c => pattern.test(c.key));

/**
 * @typedef AutoAuraEffectRule
 * How one kind of effect of a feature or spell is set up.
 * @property {"aura"|"merge"|"cast"} mode
 *   - `aura`: the effect becomes an aura emitted by the actor owning the item.
 *   - `merge`: an always-on addition to the Aura of Protection. The effect stays on the item as the source of the
 *     changes but no longer applies itself; its changes, statuses and description are added to the Aura of
 *     Protection's aura effect.
 *   - `cast`: a spell's effect becomes an aura template. Applying it to the caster from the chat card (which ends
 *     with Concentration) makes the caster the source.
 * @property {(effect: object) => boolean} [match]   Which existing effects this rule covers. Default: every effect
 *                                                   for `aura`/`merge`, the effects of the casting activity for
 *                                                   `cast`.
 * @property {{ changes?: object[], statuses?: string[], system?: object, flags?: object, description?: boolean }} [create]
 *   Effect to create when the item has none matching (named after the item). `description` copies the item's rules
 *   text.
 * @property {object[]} [fill]                       Changes for matching effects which come without any.
 * @property {boolean} [dropStatuses]                Remove statuses from matching effects (they would be applied).
 * @property {RegExp} [dropChanges]                  Remove changes whose key matches.
 * @property {string|number} [distance]              `PROTECTION`, or the distance used when the item has no area
 * @property {number} [disposition]                  DISPOSITIONS value, default FRIENDLY
 * @property {boolean} [applyToSelf]                 Default true
 * @property {string[]} [script]                     Conditions, all of which must hold
 * @property {string} [bestFormula]
 * @property {boolean} [nameAfterItem]               Applied copies are named after the item, not the effect
 */

/**
 * @typedef AutoAuraRule
 * @property {string[]} [types]                      Item types, default ["feat"]
 * @property {boolean} [paladin]                     Part of the Aura of Protection family (flag `paladinAura`,
 *                                                   resized by Aura Expansion); others are flagged `autoAura`
 * @property {boolean} [itemText]                    Whether merged additions describe themselves with the item's
 *                                                   description (default true)
 * @property {AutoAuraEffectRule[]} effects
 */

/** Settings shared by the Aura of Protection family */
const PALADIN_AURA = { mode: "aura", distance: PROTECTION, script: [SOURCE_ACTIVE] };

/**
 * Features, traits and spells set up as auras automatically, by item identifier.
 * @type {Record<string, AutoAuraRule>}
 */
const AUTO_AURAS = {
  // Paladin
  [AURA_OF_PROTECTION]: {
    paladin: true,
    effects: [{
      ...PALADIN_AURA,
      bestFormula: "max(1, @abilities.cha.mod)",
      // 2014 SRD class feature, which comes without an effect
      create: { changes: [add("system.bonuses.abilities.save", "max(1, @abilities.cha.mod)")] }
    }]
  },
  "aura-of-courage": { paladin: true, effects: [{ mode: "merge", create: { changes: [add("system.traits.ci.value", "frightened")] } }] },
  "aura-of-devotion": { paladin: true, effects: [{ mode: "merge", create: { changes: [add("system.traits.ci.value", "charmed")] } }] },
  // Player's Handbook, Oath of the Ancients
  "aura-of-warding": { paladin: true, effects: [{ mode: "merge" }] },
  // World of Warcraft, Oath of the Ebon Blade
  "aura-of-deathly-endurance": {
    paladin: true,
    effects: [{ mode: "merge", create: { changes: ["cold", "necrotic", "psychic"].map(t => add("system.traits.dr.value", t)) } }]
  },
  // Player's Handbook, Oath of Glory capstone: a toggled effect granting Half Cover, kept as its own aura so it can
  // be switched on from the actor
  "smite-of-protection": { paladin: true, effects: [PALADIN_AURA] },
  // Heroes of Faerûn, Oath of the Noble Genies: one toggled effect per damage type, kept as auras for the same reason
  "aura-of-elemental-shielding": { paladin: true, effects: [PALADIN_AURA] },
  // World of Warcraft: Twisted Aura of a paladin attuned to the weapon
  frostmourne: {
    paladin: true,
    types: ["weapon"],
    itemText: false,
    effects: [
      // Numb to Cold: allies in the Aura of Protection are immune to Cold damage
      { mode: "merge", match: e => !e.transfer && hasChange(e, /^system\.traits\.di\.value$/) },
      // Marshal Undead: Undead of your choice (excluding you) have Advantage on attack rolls and saving throws
      {
        ...PALADIN_AURA,
        match: e => hasChange(e, /^system\.rolls\.attack\.mode$/),
        applyToSelf: false,
        script: [SOURCE_ACTIVE, SOURCE_HAS_PROTECTION, TARGET_UNDEAD]
      }
    ]
  },

  // Creature traits
  // Monster Manual: Questing Knight. The effect lists the conditions it grants immunity to as statuses too, and is
  // named after them; allies receive it under the trait's name instead.
  "aura-of-bravery": { effects: [{ mode: "aura", distance: 30, dropStatuses: true, nameAfterItem: true }] },
  // Monster Manual: Hobgoblin Captain, Hobgoblin Warlord; Forge of the Artificer: Emerald Claw Commander
  "aura-of-authority": {
    effects: [{ mode: "aura", distance: 10, script: [SOURCE_ACTIVE], create: { changes: [advantage("attack"), advantage("save")] } }]
  },
  // Monster Manual: Death Knight; Ravenloft: Lord Soth; Arcana Unleashed: Necromancer Archmage
  "marshal-undead": {
    effects: [{
      mode: "aura",
      distance: 60,
      applyToSelf: false,
      script: [SOURCE_ACTIVE, TARGET_UNDEAD],
      fill: [advantage("attack"), advantage("save")],
      create: { changes: [advantage("attack"), advantage("save")] }
    }]
  },
  // World of Warcraft: Houndmaster Loksey
  "aura-of-loyalty": { effects: [{ mode: "aura", distance: 30, disposition: DISPOSITIONS.ANY, script: [SOURCE_ACTIVE, TARGET_BEAST] }] },
  // Dungeon Master's Guide
  "gloom-shroud": {
    effects: [{
      mode: "aura",
      distance: 20,
      disposition: DISPOSITIONS.ANY,
      applyToSelf: false,
      create: { changes: [add("system.abilities.cha.check.roll.mode", -1), add("system.abilities.cha.save.roll.mode", -1)] }
    }]
  },
  // Ravenloft, Bard: Half Cover within Spirit Guardians, switched on by hand
  "empowered-channeling": { effects: [{ mode: "aura", distance: 15, match: e => e.statuses?.includes("coverHalf") }] },

  // Spells
  "pass-without-trace": { types: ["spell"], effects: [{ mode: "cast", distance: 30 }] },
  "holy-aura": {
    types: ["spell"],
    effects: [{ mode: "cast", distance: 30, match: e => !e.transfer && hasChange(e, /save\.roll\.mode$/), dropChanges: /^token\./ }]
  },
  "aura-of-life": { types: ["spell"], effects: [{ mode: "cast", distance: 30, create: { changes: [add("system.traits.dr.value", "necrotic")] } }] },
  "aura-of-purity": { types: ["spell"], effects: [{ mode: "cast", distance: 30, create: { changes: [add("system.traits.dr.value", "poison")] } }] },
  "crusaders-mantle": {
    types: ["spell"],
    effects: [{
      mode: "cast",
      distance: 30,
      create: { changes: [add("system.rolls.damage.mwak.bonus", "1d4[radiant]"), add("system.rolls.damage.rwak.bonus", "1d4[radiant]")] }
    }]
  },
  "spirit-guardians": {
    types: ["spell"],
    effects: [{
      mode: "cast",
      distance: 15,
      disposition: DISPOSITIONS.HOSTILE,
      applyToSelf: false,
      match: e => !e.transfer && hasChange(e, /^system\.attributes\.movement\./),
      create: {
        changes: ["walk", "burrow", "climb", "fly", "swim"]
          .map(m => ({ key: `system.attributes.movement.${m}`, type: "multiply", value: 0.5 }))
      }
    }]
  },
  // The effect has no changes: Nik's DnD5e Tweaks recognizes it by this flag and handles the saves and damage
  "circle-of-power": {
    types: ["spell"],
    effects: [{
      mode: "cast",
      distance: 30,
      create: { description: true, system: { magical: true }, flags: { "niks-dnd5e-tweaks": { circleOfPower: true } } }
    }]
  },
  // Arcana Unleashed: no benefit for an Incapacitated creature
  "aura-of-evasion": { types: ["spell"], effects: [{ mode: "cast", distance: 30, script: [TARGET_ACTIVE] }] },
  // World of Warcraft
  tranquility: { types: ["spell"], effects: [{ mode: "cast", distance: 60 }] },
  // Heroes of Faerûn: Alustriel's Mooncloak
  mooncloak: {
    types: ["spell"],
    effects: [{
      mode: "cast",
      distance: 20,
      create: { statuses: ["coverHalf"], changes: ["cold", "lightning", "radiant"].map(t => add("system.traits.dr.value", t)) }
    }]
  }
};

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerDnd5eHooks() {
  Hooks.on("dnd5e.transformActor", onTransformation);
  Hooks.on("dnd5e.revertOriginalForm", onTransformation);
  Hooks.on("preCreateItem", onPreCreateItem);
  Hooks.on("preCreateActor", onPreCreateActor);
  Hooks.on("createItem", onAutoAuraItemChange);
  Hooks.on("updateItem", onAutoAuraItemChange);
  Hooks.on("deleteItem", onAutoAuraItemChange);
  Hooks.on("preCreateActiveEffect", onPreCreateCastAura);
  Hooks.on("preCreateRegion", onPreCreateCircleRegion);
  Hooks.on("deleteActiveEffect", onConcentrationEnd);
  Hooks.on("createActiveEffect", onAdditionEffectChange);
  Hooks.on("updateActiveEffect", onAdditionEffectChange);
  Hooks.on("deleteActiveEffect", onAdditionEffectChange);
}

export function registerDnd5eSettings() {
  // The key predates the spells and creature traits
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
/*  Setting up items                            */
/* -------------------------------------------- */

/**
 * The automatic aura an item represents, if any
 * @param {Item} item
 * @returns {string|null}   The item's identifier
 */
function getAutoAuraFeature(item) {
  const identifier = item.identifier;
  const rule = AUTO_AURAS[identifier];
  if (!rule || !(rule.types ?? ["feat"]).includes(item.type)) return null;
  return identifier;
}

/**
 * The distance formulas this module writes for the Aura of Protection, so that distances a user typed in are left
 * alone when Aura Expansion is gained or lost
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
function getProtectionDistance(actor) {
  if (actor.items.some(i => (i.type === "feat") && (i.identifier === AURA_EXPANSION))) return EXPANDED_DISTANCE;
  const paladin = actor.items.find(i => (i.type === "class") && (i.identifier === "paladin"));
  const advancements = Object.values(paladin?._source.system.advancement ?? {});
  const hasLegacyScale = advancements.some(a => (a.type === "ScaleValue") && (a.configuration?.identifier === "aura-radius"));
  return getScaleDistance(hasLegacyScale ? "aura-radius" : "aura");
}

/**
 * The size of an item's area of effect, from its activities or (for spells) the item itself
 * @param {object} itemData
 * @returns {string|null}
 */
function getTemplateSize(itemData) {
  const sizes = [
    ...Object.values(itemData.system?.activities ?? {}).map(a => a.target?.template?.size),
    itemData.system?.target?.template?.size
  ];
  const size = sizes.find(s => Number(s) > 0);
  return size ? String(Number(size)) : null;
}

/**
 * Aura settings for an effect rule
 * @param {AutoAuraEffectRule} effectRule
 * @param {object} itemData   Source data of the item
 * @param {Actor} actor       The actor owning the item
 * @returns {object}          System data of the aura effect
 */
function getAuraSystem(effectRule, itemData, actor) {
  const distance = effectRule.distance === PROTECTION
    ? getProtectionDistance(actor)
    : getTemplateSize(itemData) ?? String(effectRule.distance ?? 0);
  return {
    applyToSelf: effectRule.applyToSelf ?? true,
    bestFormula: effectRule.bestFormula ?? "",
    disposition: effectRule.disposition ?? DISPOSITIONS.FRIENDLY,
    distanceFormula: distance,
    // Change values like the paladin's Charisma bonus refer to the source, not to the creature receiving the aura
    evaluatePreApply: true,
    overrideName: effectRule.nameAfterItem ? itemData.name : "",
    script: (effectRule.script ?? []).join(" && "),
    showRadius: game.settings.get("auraeffects", "defaultVisibility")
  };
}

/**
 * The activity casting a spell, to which its aura effect is linked: the one already applying a matching effect,
 * otherwise the main utility activity
 * @param {object} itemData
 * @param {Set<string>} effectIds   Ids of the effects the rule covers
 * @returns {string|null}           The activity's id
 */
function getCastActivity(itemData, effectIds) {
  const activities = Object.entries(itemData.system?.activities ?? {});
  // The casting utility activity wins over a save activity which applies the effect to failed saves (e.g. the
  // Monster Manual's Spirit Guardians)
  const score = ([, a]) => ((a.type === "utility") ? 4 : 0) + (a.effects?.some(e => effectIds.has(e._id)) ? 3 : 0)
    + ((a.activation?.type === "action") ? 2 : 0) + ((a.type === "heal") ? 1 : 0);
  return activities.sort((a, b) => score(b) - score(a))[0]?.[0] ?? null;
}

/**
 * Set up an item's effects by its rule. Effects which already are auras are left as they are, so that customized
 * auras survive being copied to another actor.
 * @param {object} itemData   Source data of the item, modified in place
 * @param {string} feature    The item's identifier
 * @param {Actor} actor       The actor owning the item
 * @returns {{ converted: object[], created: object[], activities: Record<string, object[]> }|null}
 *   The changed and created effects and the changed effect lists of activities; null if nothing changed
 */
function configureAutoAuraData(itemData, feature, actor) {
  const rule = AUTO_AURAS[feature];
  const flagKey = rule.paladin ? "paladinAura" : "autoAura";
  const effects = itemData.effects ??= [];
  const activities = itemData.system?.activities ?? {};
  const converted = [];
  const created = [];
  const unlink = new Set();
  const link = {};

  for (const effectRule of rule.effects) {
    const { mode } = effectRule;
    const candidates = effects.filter(e => (e.type !== "auraeffects.aura") && (e.type !== "enchantment")
      && !e.flags?.auraeffects?.[flagKey]);
    let matched;
    let castActivity;
    if (effectRule.match) matched = candidates.filter(effectRule.match);
    else if (mode === "cast") {
      castActivity = getCastActivity(itemData, new Set());
      const linked = new Set((activities[castActivity]?.effects ?? []).map(e => e._id));
      matched = candidates.filter(e => !e.transfer && linked.has(e._id));
    } else matched = candidates;
    if (mode === "cast") castActivity ??= getCastActivity(itemData, new Set(matched.map(e => e._id)));

    // Effects of earlier runs (e.g. a carrier already set up) count as matching, so nothing is created twice
    const configured = effects.some(e => e.flags?.auraeffects?.[flagKey] && (!effectRule.match || effectRule.match(e)));
    const isAura = mode !== "merge";
    const system = isAura ? getAuraSystem(effectRule, itemData, actor) : {};
    const transfer = (mode === "aura");

    for (const effect of matched) {
      const changes = (effect.system?.changes ?? []).filter(c => !effectRule.dropChanges?.test(c.key));
      const update = {
        transfer,
        system: { changes: (!changes.length && effectRule.fill) ? foundry.utils.deepClone(effectRule.fill) : changes },
        flags: { auraeffects: { [flagKey]: feature } }
      };
      if (effectRule.dropStatuses) update.statuses = [];
      if (isAura) {
        update.type = "auraeffects.aura";
        Object.assign(update.system, foundry.utils.deepClone(system));
        update.flags.auraeffects.originalType = effect.type ?? "base";
      }
      foundry.utils.mergeObject(effect, update);
      converted.push(effect);
    }

    if (!matched.length && !configured && effectRule.create) {
      const effect = {
        _id: foundry.utils.randomID(),
        name: itemData.name,
        img: itemData.img,
        type: isAura ? "auraeffects.aura" : "base",
        transfer,
        description: effectRule.create.description ? stripSecrets(itemData.system?.description?.value) : "",
        statuses: [...(effectRule.create.statuses ?? [])],
        system: {
          ...foundry.utils.deepClone(effectRule.create.system ?? {}),
          ...foundry.utils.deepClone(system),
          changes: foundry.utils.deepClone(effectRule.create.changes ?? [])
        },
        flags: {
          ...foundry.utils.deepClone(effectRule.create.flags ?? {}),
          auraeffects: { [flagKey]: feature, ...(isAura ? { originalType: "base" } : {}) }
        }
      };
      effects.push(effect);
      created.push(effect);
      matched = [effect];
    }

    // A spell's casting activity applies the aura to the caster; any other activity applying a feature's effect to
    // a target would duplicate what the aura gives, or make the target a second aura source
    for (const effect of matched) {
      if (!effect._id) continue;
      unlink.add(effect._id);
      if ((mode === "cast") && castActivity) (link[castActivity] ??= []).push(effect._id);
    }
  }
  if (!converted.length && !created.length) return null;

  const activityEffects = {};
  for (const [id, activity] of Object.entries(activities)) {
    const before = activity.effects ?? [];
    const kept = before.filter(e => !unlink.has(e._id) || link[id]?.includes(e._id));
    const added = (link[id] ?? []).filter(effectId => !kept.some(e => e._id === effectId)).map(_id => ({ _id }));
    // Drop links to effects which don't exist (some spells ship with one)
    const after = [...kept, ...added].filter(e => !e._id || effects.some(effect => effect._id === e._id));
    if (JSON.stringify(after) === JSON.stringify(before)) continue;
    activity.effects = after;
    activityEffects[id] = after;
  }
  return { converted, created, activities: activityEffects };
}

/* -------------------------------------------- */
/*  Merging additions into Aura of Protection   */
/* -------------------------------------------- */

/**
 * @typedef PaladinAuraAddition
 * @property {string} name          Name of the item
 * @property {string} description   The item's description (HTML), empty if it shouldn't be used
 * @property {object[]} effects     Source data of the item's enabled carrier effects
 */

/**
 * Whether dnd5e suppresses the effects of an item, from its source data (Item5e#areEffectsSuppressed)
 * @param {object} itemData
 * @returns {boolean}
 */
function areEffectsSuppressed(itemData) {
  const system = itemData.system ?? {};
  const requireEquipped = (itemData.type !== "consumable") || ["rod", "trinket", "wand"].includes(system.type?.value);
  if (requireEquipped && (system.equipped === false)) return true;
  return !system.attuned && (system.attunement === "required");
}

/**
 * The additions to merge into the Aura of Protection, from item source data
 * @param {object[]} itemsData    Source data of the actor's items
 * @returns {PaladinAuraAddition[]}
 */
function getAdditions(itemsData) {
  const additions = [];
  for (const itemData of itemsData) {
    if (areEffectsSuppressed(itemData)) continue;
    const effects = (itemData.effects ?? []).filter(e => (e.type !== "auraeffects.aura") && !e.transfer && !e.disabled
      && e.flags?.auraeffects?.paladinAura);
    if (!effects.length) continue;
    const rule = AUTO_AURAS[effects[0].flags.auraeffects.paladinAura];
    const description = (rule?.itemText === false) ? "" : (itemData.system?.description?.value ?? "");
    additions.push({ name: itemData.name, description, effects });
  }
  return additions;
}

/**
 * Source data of an actor's items, each marked with the automatic aura it represents
 * @param {Iterable<Item>} items
 * @returns {object[]}
 */
function getItemsData(items) {
  return Array.from(items, item => {
    const itemData = item.toObject();
    foundry.utils.setProperty(itemData, "flags.auraeffects.autoAuraFeature", getAutoAuraFeature(item));
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
  return `<h4>${foundry.utils.escapeHTML(name)}</h4>${stripSecrets(description)}`;
}

/**
 * Rules text without secret sections (e.g. "Foundry Note")
 * @param {string} [description]
 * @returns {string}
 */
function stripSecrets(description) {
  return (description ?? "").replace(/<section[^>]*class="[^"]*\bsecret\b[^"]*"[^>]*>[\s\S]*?<\/section>/g, "").trim();
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
      const names = addition.effects.map(e => `<p>${foundry.utils.escapeHTML(e.name)}</p>`).join("");
      sections.push(getDescriptionSection(addition.name, ownText || addition.description || names));
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
    if (itemData.flags?.auraeffects?.autoAuraFeature !== AURA_OF_PROTECTION) continue;
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

/**
 * Whether an item carries additions to the Aura of Protection
 * @param {Item} item
 * @returns {boolean}
 */
function hasAdditions(item) {
  return AUTO_AURAS[getAutoAuraFeature(item)]?.effects.some(r => r.mode === "merge") ?? false;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * The update data for an item set up by configureAutoAuraData
 * @param {object} itemData
 * @param {Record<string, object[]>} activities
 * @returns {object}
 */
function getItemUpdate(itemData, activities) {
  const update = { effects: itemData.effects };
  for (const [id, effects] of Object.entries(activities ?? {})) update[`system.activities.${id}.effects`] = effects;
  return update;
}

/**
 * When an item with an automatic aura is added to an actor, set up its effects. Aura of Protection takes in the
 * additions the actor already has; additions gained later are merged in by onAutoAuraItemChange.
 * @param {Item} item         The item being created
 * @param {object} data       The initial creation data
 * @param {object} options    Additional options
 * @param {string} userId     The initiating User's ID
 */
function onPreCreateItem(item, data, options, userId) {
  if ((game.user.id !== userId) || !(item.parent instanceof Actor)) return;
  if (!game.settings.get("auraeffects", "paladinAuras")) return;
  const feature = getAutoAuraFeature(item);
  if (!feature) return;
  const [itemData] = getItemsData([item]);
  const result = configureAutoAuraData(itemData, feature, item.parent);
  let merged = false;
  if (feature === AURA_OF_PROTECTION) merged = mergeProtectionData([itemData, ...getItemsData(item.parent.items)]);
  if (!result && !merged) return;
  item.updateSource(getItemUpdate(itemData, result?.activities));
}

/**
 * When an actor is created with automatic auras (e.g. imported from a compendium), set up their effects
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
    const feature = itemData.flags.auraeffects.autoAuraFeature;
    if (feature && configureAutoAuraData(itemData, feature, actor)) changed = true;
  }
  if (mergeProtectionData(itemsData)) changed = true;
  if (!changed) return;
  for (const itemData of itemsData) delete itemData.flags.auraeffects.autoAuraFeature;
  actor.updateSource({ items: itemsData });
}

/**
 * When an actor gains, loses, equips or attunes an item carrying additions, update the Aura of Protection. When it
 * gains or loses Aura Expansion, resize the paladin auras whose distance this module set.
 * @param {Item} item         The item which was created, updated or deleted
 * @param {...*} args         The hook's remaining arguments, ending with the initiating User's ID
 */
async function onAutoAuraItemChange(item, ...args) {
  if ((game.user.id !== args.at(-1)) || !(item.parent instanceof Actor)) return;
  const actor = item.parent;
  if (hasAdditions(item)) {
    await syncProtectionAura(actor);
    return;
  }
  // Only creation and deletion change Aura Expansion
  if ((args.length > 2) || (item.type !== "feat") || (item.identifier !== AURA_EXPANSION)) return;
  const distanceFormula = getProtectionDistance(actor);
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
  if ((effect.type === "auraeffects.aura") || !effect.getFlag("auraeffects", "paladinAura")) return;
  const item = effect.parent;
  if (!(item instanceof Item) || !(item.parent instanceof Actor)) return;
  await syncProtectionAura(item.parent);
}

/**
 * A spell's aura applied from the chat card makes the caster the source. Applied to anyone else, it becomes a plain
 * effect instead, so that the target doesn't emit a second aura.
 * @param {ActiveEffect} effect   The effect being created
 * @param {object} data           The initial creation data
 * @param {object} options        Additional options
 * @param {string} userId         The initiating User's ID
 * @returns {boolean|void}
 */
function onPreCreateCastAura(effect, data, options, userId) {
  if ((game.user.id !== userId) || (effect.type !== "auraeffects.aura")) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor) || !effect.getFlag("auraeffects", "autoAura")) return;
  const originUuid = effect.system.origin?.activity || effect.origin || "";
  const itemUuid = originUuid.split(".Activity.")[0].split(".ActiveEffect.")[0];
  const caster = itemUuid ? fromUuidSync(itemUuid)?.actor : null;
  if (!caster || (caster.uuid === actor.uuid)) return;
  const effectData = effect.toObject();
  effectData.type = effectData.flags.auraeffects.originalType ?? "base";
  for (const key of AURA_SYSTEM_KEYS) delete effectData.system[key];
  delete effectData.flags.auraeffects;
  ActiveEffect.implementation.create(effectData, { parent: actor }).catch(err => console.error(err));
  return false;
}

/**
 * Circle of Power's area would apply the effect through a region behavior (dnd5e's, or Nik's DnD5e Tweaks' for other
 * versions of the spell). Once the spell carries the aura, the area stays as a marker without behaviors, so that
 * creatures don't receive the effect twice. Both modules skip the behaviors on this option.
 * @param {RegionDocument} region   The region being created
 * @param {object} data             The initial creation data
 * @param {object} options          Additional options, passed on to the creation operation
 */
function onPreCreateCircleRegion(region, data, options) {
  const itemUuid = region.getFlag("dnd5e", "item");
  if (!itemUuid) return;
  const item = fromUuidSync(itemUuid);
  if (!item?.effects?.some(e => (e.type === "auraeffects.aura") && (e.getFlag("auraeffects", "autoAura") === "circle-of-power"))) return;
  options.dnd5e = { ...options.dnd5e, createActivityBehaviors: false };
  // dnd5e doesn't tie placed areas to concentration; mark it so that onConcentrationEnd can remove it
  region.updateSource({ "flags.auraeffects.castTemplate": true });
}

/**
 * When concentration on a spell ends, remove the areas marked by onPreCreateCircleRegion which were placed for it.
 * dnd5e leaves placed areas behind; for Circle of Power the aura has taken over, so the area would only linger.
 * @param {ActiveEffect} effect   The effect being deleted
 */
function onConcentrationEnd(effect) {
  if (!game.user.isActiveGM || !(effect.parent instanceof Actor)) return;
  if ((effect.system?.type !== "concentrating") && !effect.statuses?.has(CONFIG.specialStatusEffects.CONCENTRATING)) return;
  const itemUuid = effect.flags?.dnd5e?.item?.uuid;
  if (!itemUuid) return;
  for (const scene of game.scenes) {
    const ids = scene.regions
      .filter(r => r.flags?.auraeffects?.castTemplate && (r.flags.dnd5e?.item === itemUuid))
      .map(r => r.id);
    if (ids.length) scene.deleteEmbeddedDocuments("Region", ids).catch(err => console.error(err));
  }
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

/**
 * Set up the automatic auras an existing actor already has (paladin features, creature traits, spells), as if they
 * had just been added. Effects which already are auras are left alone.
 * @param {Actor} actor
 * @returns {Promise<Item[]>}   The items which were changed
 */
export async function configureAutoAuras(actor) {
  if (game.system.id !== "dnd5e") return [];
  const changedItems = [];
  for (const item of actor.items) {
    const feature = getAutoAuraFeature(item);
    if (!feature) continue;
    const itemData = item.toObject();
    const result = configureAutoAuraData(itemData, feature, actor);
    if (!result) continue;
    // Keep the hooks from merging half-configured additions; the actor is synced once at the end
    const options = { auraeffectsSkipSync: true };
    if (result.converted.length) await item.updateEmbeddedDocuments("ActiveEffect", result.converted.map(e => ({
      _id: e._id,
      type: e.type,
      transfer: e.transfer,
      statuses: e.statuses,
      system: _replace(e.system),
      "flags.auraeffects": e.flags.auraeffects
    })), options);
    if (result.created.length) await item.createEmbeddedDocuments("ActiveEffect", result.created, { ...options, keepId: true });
    const activityUpdate = getItemUpdate(itemData, result.activities);
    delete activityUpdate.effects;
    if (!foundry.utils.isEmpty(activityUpdate)) await item.update(activityUpdate);
    changedItems.push(item);
  }
  await syncProtectionAura(actor);
  return changedItems;
}

/** @deprecated The name from before spells and creature traits were added (14.5.0); same function */
export const configurePaladinAuras = configureAutoAuras;
