import { getActorTokens, getActiveAuraEffects, removeAndReplaceAuras } from "../helpers.mjs";

/** @import { Actor } from "@client/documents/_module.mjs" */

export function registerDnd5eHooks() {
  Hooks.on("dnd5e.transformActor", onTransformation);
  Hooks.on("dnd5e.revertOriginalForm", onTransformation);
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
      if (token === sourceToken) continue;
      // TODO: For version 3.0, simplify this with the assumption that the old boolean-style fromAura flags are gone
      const badEffect = token.actor?.effects.find(e => [e.getFlag("auraeffects", "fromAura"), e.origin].includes(sourceEffect.uuid));
      if (badEffect) toDelete.push(badEffect);
    }
  }
  if (toDelete.length) await removeAndReplaceAuras(toDelete, sourceToken.parent);
}