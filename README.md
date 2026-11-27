# Nik's Aura Effects

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-V14-orange.svg)](https://foundryvtt.com)
[![Latest Release](https://img.shields.io/github/v/release/nschoenwald/niks-aura-effects?color=purple)](https://github.com/nschoenwald/niks-aura-effects/releases/latest)

Active effects that radiate from a token and apply to other tokens nearby, for **Foundry VTT v14**. A fork of [Aura Effects](https://git.gay/roth-michael/Aura-Effects) by Michael Roth with fixes to when auras are recalculated. Existing aura effects, settings and worlds keep working unchanged.

---

## ✨ Features

- **Aura effects**: Turn any active effect into an aura with the **Convert to Aura** button on the effect sheet. Tokens inside the aura's radius receive a copy of the effect. Leaving the radius removes it.
- **Who it applies to**: Friendly, hostile or any tokens, optionally the source token itself, and an optional conditional script. Secret tokens count as hostile.
- **Conditional scripts**: A script is code, so it only runs where that's safe. Scripts on effects only the GM can edit run everywhere, as do the ones the module writes for automatic auras. A script on a player's own character runs only on that player's computer, never on the GM's: while only the GM or another player is around to check it, the aura stays as it is (it isn't applied or removed). To use a script on a character on every computer, have it be part of an effect only the GM can edit.
- **A broken formula stays contained**: A radius or "best" formula that can't be calculated counts as 0 (with a warning in the browser console) instead of stopping auras for everyone.
- **Radius**: A fixed distance or a formula using the actor's data (for example `@abilities.cha.mod`). Walls can block the aura, by the collision type you pick.
- **Elevation**: The aura reaches as far up and down as its radius, measured from the token's feet and top. A creature flying high above the source isn't affected. Can be turned off with a setting.
- **Stacking**: Auras with the same name either stack or only the best one applies, chosen by a "best" formula.
- **Combat only / hidden**: Auras can switch off outside combat or while their token is hidden.
- **Effect icons**: Copies of an aura on other tokens always show their icon on the token and in the effect tray, unless the aura's icon setting is **Never**. The source actor's own copy (auras that also affect the source) stays hidden.
- **Smooth movement**: When a token moves into or out of an aura, the effect changes once the token arrives, not while it is still moving, so the movement doesn't stutter. Removing one aura and applying another happens in one step.
- **Light on busy turns**: Several changes to a creature in a row (damage, item uses, effects) are checked together once they're done, about a tenth of a second later, instead of once per change.
- **Live updates**: Editing an aura, changing the actor, or equipping and unequipping items updates the aura and the copies already applied. Auras on items that aren't equipped (or not attuned, where required) are off.

### Which scenes count

A player character's effects belong to the character, so they show on every scene. To keep that predictable, auras on characters (tokens linked to an actor) are only applied and removed on the scenes in play:

- the **active scene**, and
- any scene a **connected player** is looking at, for example when the GM pulls part of the group elsewhere.

If a character has tokens on several of these scenes, the scene its player is looking at wins, otherwise the active scene. Moving a character's token on a scene you are preparing changes nothing for that character.

NPC tokens that aren't linked to an actor have their own copy of the actor, so they pick up auras on every scene. A prepared encounter is ready as soon as it goes live.

When the active scene changes, a player arrives on another scene, or a GM logs in, auras are recalculated for every scene in play. Characters with no token on any of these scenes lose auras they picked up elsewhere.

> To test an aura on a character alone, activate the scene first. On an inactive scene with no player looking at it, characters don't receive auras.

A GM must be logged in for auras to work. Without one, changes are picked up when a GM logs in. Players only get the "no GM" warning when a change actually involves auras, not for every edit to their character.

### D&D 5e: automatic auras

Paladin features, creature traits and spells that radiate an aura are set up for you. Everything is recognized by its identifier, so this works in every language. Effects that already are auras are never changed, so your own settings survive. A feature or spell that already carries an aura you made yourself doesn't get a second one. The **Automatic Auras** setting turns it off.

#### Paladin

When a character gains **Aura of Protection**, its effect is set up as an aura automatically:

- allies and the paladin within **10 feet**, or **30 feet** with **Aura Expansion** (follows the paladin class's aura scale value, 2024 and 2014 class),
- inactive while the paladin is **Incapacitated, Paralyzed, Petrified, Stunned, Unconscious or dead**,
- the Charisma bonus is the paladin's, and with several paladins each creature gets the **strongest** one.

**One effect for everything.** The always-on features that work inside the aura are added to the Aura of Protection effect: **Aura of Courage**, **Aura of Devotion**, **Aura of Warding**, **Aura of Alacrity** and **Aura of Deathly Endurance** (World of Warcraft). Their changes and conditions become part of it, and its description gets a section with each feature's rules text. Allies receive one effect with all the benefits instead of several. Each feature keeps its own effect as the source but it no longer applies by itself, so nothing is doubled:

- turn a feature's effect off (on the feature) to take it back out of the aura, or edit it to change what the aura gives,
- removing the feature removes its benefit from the aura,
- your own edits to the Aura of Protection effect (extra changes, a note in the description) are kept.

Because everything rides on one effect, a creature inside the auras of two paladins gets all the benefits of the stronger paladin's aura, matching the rule that a creature benefits from only one Aura of Protection at a time.

**Smite of Protection** and **Aura of Elemental Shielding** (Heroes of Faerûn) are switched on by hand, so they stay separate auras with the same area and conditions, off until you enable them. Features that come without an effect get one with the book's benefits: the 2014 versions of Aura of Protection, Courage and Devotion, Aura of Deathly Endurance, and copies of Aura of Warding or Smite of Protection whose effect was deleted. **Aura of Alacrity** gives allies the 10 feet of Speed while they are in the aura; the rules let them keep it until the end of their next turn after leaving, which stays manual. Still manual: the capstones that imbue the aura for a while (Holy Nimbus, Elder Champion, Avenging Angel, Holy Deliverance) and Lightbringer's Aura.

**Frostmourne** (World of Warcraft): while a paladin is attuned to it, *Numb to Cold* is added to the Aura of Protection effect, and *Marshal Undead* becomes an aura with the same area for Undead allies (not the paladin).

#### Creature traits

Set up as soon as the creature has them, also when it's imported from a compendium. The area is taken from the trait.

| Trait | Who has it | Affects |
|---|---|---|
| Aura of Bravery | Questing Knight | allies and itself: immune to Charmed and Frightened |
| Aura of Authority | Hobgoblin Captain, Hobgoblin Warlord, Emerald Claw Commander | allies and itself: Advantage on attacks and saves; off while Incapacitated |
| Marshal Undead | Death Knight, Lord Soth, Necromancer Archmage | Undead allies (not itself): Advantage on attacks and saves; off while Incapacitated |
| Aura of Loyalty | Houndmaster Loksey | Beasts: Advantage on saves; off while Incapacitated. Extra damage and healing stay manual. |
| Gloom Shroud | Dungeon Master's Guide | every other creature: Disadvantage on Charisma checks and saves |
| Empowered Channeling | Ravenloft bard | you and allies within Spirit Guardians: Half Cover, switched on by hand |

#### Spells

| Spell | Affects |
|---|---|
| Pass without Trace | you and allies: +10 Stealth |
| Holy Aura | you and allies: Advantage on saves |
| Aura of Life | you and allies: Necrotic resistance |
| Aura of Purity | you and allies: Poison resistance |
| Circle of Power | you and allies: carries the effect; the Advantage and no-damage rules come from [Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks) |
| Crusader's Mantle | you and allies: +1d4 Radiant damage with weapons |
| Spirit Guardians | enemies: Speed halved (the damage stays a saving throw) |
| Aura of Evasion | you and allies: Advantage on Dexterity saves, not while Incapacitated |
| Tranquility | you and allies: resistance to bludgeoning, piercing and slashing |
| Alustriel's Mooncloak | you and allies: Half Cover, Cold, Lightning and Radiant resistance |

Cast the spell and the aura is on: you become its source, everyone in range gets the effect, and it ends with your Concentration. The spell's area is placed as usual, so animations from Automated Animations or BLFX that start from it still play; it is removed when your Concentration ends. The spell's chat card lists only you as its target, not whatever you had targeted before. **Spirit Guardians** targets as usual, since Nik's DnD5e Tweaks uses its area for the damage. Applied from the chat card to another creature, the effect stays a normal effect and doesn't become a second aura; creatures already inside your aura are skipped, so applying it to every target doesn't give anyone the effect twice. Nik's DnD5e Tweaks (14.117.0 or later) only targets you in the area; the area itself is a marker without the effect. With midi-qol applying item effects, midi-qol targets and applies these spells as usual. Parts of these spells that no effect can express (Holy Aura's Disadvantage on attacks against allies, Aura of Life's Hit Point maximum, Aura of Purity's Advantage against conditions) stay manual.

#### Existing actors

Whenever an update changes how the automatic auras are set up (a radius, a condition, which creatures they reach, the bonuses of an effect the module created), the first GM to log in afterwards brings every actor in the Actors sidebar and every unlinked token up to date, and sets up features and spells that newly get an automatic aura (only with the **Automatic Auras** setting on). Only what the module set up itself and nobody changed since is updated: a radius, condition or bonus you edited, the effect's name, image, description, whether it's switched on and whether it shows its radius stay as they are. Changes and statuses an effect already had before it became an aura are never touched. The paladin's Aura of Protection keeps following Aura Expansion and the features merged into it as before.

For actors imported or changed outside Foundry, for actors imported or changed outside Foundry, run the **Set Up Automatic Auras (D&D 5e)** macro from the **Aura Effects Macros** compendium once as GM. It goes through every actor in the Actors sidebar and every unlinked token on every scene, ignores the setting, leaves actors without any of these alone, and is safe to run again; it also brings auras set up earlier up to date as described above. The comment at the top of the macro explains what it changes. To set up a single actor instead:

```js
await game.modules.get("auraeffects").api.configureAutoAuras(game.actors.getName("Actor Name"));
```

---

## ⚙️ Settings

- **Aura Effects Default to Visible**: Show the radius of newly created auras to everyone.
- **Disable Scrolling Text for Aura Effects**: No floating text when auras are added or removed.
- **Aura Highlight Mode**: Highlight the exact aura shape or the grid spaces it covers.
- **Ignore Elevation for Auras**: Auras reach any height, ignoring the elevation of tokens.
- **Automatic Auras (D&D 5e)**: Set up paladin auras, creature traits and aura spells automatically (see above). On by default.
- **Prefer Most Recent Aura**: For non-stacking auras with no "best" formula, the newest one wins instead of the existing one.

---

## 🤝 Compatibility

- **Game systems**: System-agnostic. D&D 5e: paladin features, creature traits and aura spells set themselves up (see above), and auras applied by a transformed actor are cleaned up when it transforms or reverts.
- **Active Auras**: A macro in the module's compendium converts Active Auras effects to Aura Effects.
- **Macros compendium**: "Migrate from Active Auras" and "Set Up Automatic Auras (D&D 5e)".

---

## 🌐 Languages

🇬🇧 English · 🇩🇪 Deutsch · 🇫🇷 Français (thanks Kameleau) · 🇮🇹 Italiano · 🇧🇷 Português (Brasil) · 🇨🇿 Čeština

---

## 📦 Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:
```
https://github.com/nschoenwald/niks-aura-effects/releases/latest/download/module.json
```

Requires **Foundry VTT v14**.

---

## Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
* **[Nik's Action HUD](https://github.com/nschoenwald/niks-action-hud)** – Sleek, modern canvas-docked Action HUD for quick access to attacks, spells, inventory, and utility rolls.
* **[Nik's Effects Panel](https://github.com/nschoenwald/niks-effects-panel)** – Floating panel next to the sidebar that shows the selected token's active effects, to check, disable or remove them without opening the character sheet.
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.
* **[Nik's Token Motion](https://github.com/nschoenwald/niks-token-motion)** – Tokens hop square by square like miniatures, lift and set down like chess pieces, or glide smoothly, and long moves no longer crawl across the map.
* **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** – Compact, single-line chat messages logging token HP and Temp HP changes.

### 🎨 Visuals & Display
* **[Nik's Dynamic Roll Area](https://github.com/nschoenwald/niks-dynamic-roll-area)** – Dynamically restricts Dice So Nice 3D dice rolling area to exclude the sidebar / chat log across all screen resolutions and window sizes.

### ⚙️ Utilities & System Management
* **[Nik's Settings Locks](https://github.com/nschoenwald/niks-settings-locks)** – Soft-lock and hard-lock client settings and keybindings across all connected players.
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Copy Environment](https://github.com/nschoenwald/niks-copy-environment)** – Copy the list of systems, modules, and versions, and export/import game and player settings.
* **[Nik's Show & Tell](https://github.com/nschoenwald/niks-show-and-tell)** – Share popout images to chat and paste image files directly into chat messages.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.
* **[Nik's Scene Transformations](https://github.com/nschoenwald/niks-scene-transformations)** – Rotate scenes or add playable space around them, with tokens, walls, lights, tiles and regions moved along so everything stays in place.
* **[Nik's Wall Height](https://github.com/nschoenwald/niks-wall-height)** – Give walls a bottom and top elevation, so tokens, lights and sounds above or below a wall ignore it.
* **[Nik's Scene Defaults](https://github.com/nschoenwald/niks-scene-defaults)** – Set your own defaults for new scenes (grid, vision, fog, lighting, background and more), so you don't have to change them on every scene.

---

## 📜 License

MIT License. See [LICENSE](LICENSE).

Based on **[DFreds Effects Panel](https://github.com/DFreds/dfreds-effects-panel)** by Derek Fredrickson (DFreds), who created the original effects panel for Foundry VTT. Not affiliated with Foundry Gaming LLC.
