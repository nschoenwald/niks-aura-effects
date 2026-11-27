export async function migrate() {
  const sortedMigrations = Object.entries(migrations).sort((a, b) => {
    return foundry.utils.isNewerVersion(b[0], a[0]) ? -1 : 1;
  });
  const migrationVersion = game.settings.get("auraeffects", "migrationVersion");
  let existingAlert;
  for (const [version, migration] of sortedMigrations) {
    if (!foundry.utils.isNewerVersion(version, migrationVersion)) continue;
    if (migration.alert && !existingAlert) existingAlert = ui.notifications.info("AURAEFFECTS.Migrations.Beginning", { permanent: true, localize: true });
    await migration.migrateFunction();
    await game.settings.set("auraeffects", "migrationVersion", version);
  }
  if (existingAlert) {
    existingAlert.remove();
    ui.notifications.success("AURAEFFECTS.Migrations.AllCompleted", { localize: true });
  }
}
const migrations = {
  "1.0.0": {
    alert: false,
    migrateFunction: async () => {
      ChatMessage.implementation.create({
        speaker: {
          alias: "Aura Effects"
        },
        whisper: [game.user],
        content: _loc("AURAEFFECTS.Migrations.ActiveAurasChatMessage")
      })
    }
  },
  "14.7.1": {
    alert: false,
    migrateFunction: showAppliedAuraIcons
  },
  "14.7.4": {
    alert: true,
    migrateFunction: setUpAutoAuras
  },
  // Again, for Aura of Warding copies without an effect, which 14.7.4 couldn't set up
  "14.7.5": {
    alert: true,
    migrateFunction: setUpAutoAuras
  }
}

/**
 * Run the automatic aura setup (D&D 5e) once for every world actor and unlinked token, as the "Set Up Automatic Auras"
 * macro does.
 * Items added since 14.5.0 are set up when they're created, but spells and features that actors already had stayed
 * plain effects until someone ran the macro. Respects the Automatic Auras setting; auras are never changed.
 */
async function setUpAutoAuras() {
  if ((game.system.id !== "dnd5e") || !game.settings.get("auraeffects", "paladinAuras")) return;
  const { configureAutoAuras } = await import("./systems/dnd5e.mjs");
  const actors = new Set(game.actors);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.add(token.actor);
  }
  for (const actor of actors) {
    try {
      await configureAutoAuras(actor);
    } catch (err) {
      console.error(`Aura Effects | Setting up automatic auras for ${actor.name} failed`, err);
    }
  }
}

/**
 * Applied aura copies used to keep the source's "if temporary" icon setting, which hides them. Show them always,
 * except copies on the source's own actor (hidden on purpose) and copies with a duration.
 */
async function showAppliedAuraIcons() {
  const { CONDITIONAL, ALWAYS } = CONST.ACTIVE_EFFECT_SHOW_ICON;
  const actors = new Set(game.actors);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.add(token.actor);
  }
  for (const actor of actors) {
    const updates = actor.effects.filter(e => {
      const origin = e.getFlag("auraeffects", "fromAura");
      if ((typeof origin !== "string") || (e.showIcon !== CONDITIONAL) || e.isTemporary) return false;
      return fromUuidSync(origin, { strict: false })?.actor !== actor;
    }).map(e => ({ _id: e.id, showIcon: ALWAYS }));
    if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates, { animate: false }).catch(err => console.error(err));
  }
}