# Changelog

All notable changes to Nik's Aura Effects are documented in this file.

## [14.7.0] — 2026-11-22
### Added
- **Circle of Power sets itself up (D&D 5e)**: Cast the spell and apply its effect to yourself from the chat card: you and allies within 30 feet get it, and it ends with your Concentration. With Nik's DnD5e Tweaks, the effect gives Advantage on saves against spells and magical effects, and no damage on a successful save. Without it, the effect is a reminder. The spell's placed area no longer applies the effect as well, so nobody gets it twice. For actors who already have the spell, run the **Set Up Automatic Auras (D&D 5e)** macro once.

## [14.6.0] — 2026-11-20
### Added
- **More auras set themselves up (D&D 5e)**: Besides the paladin's Aura of Protection, these now become working auras automatically:
  - **Creature traits**, as soon as the creature has them: Aura of Bravery (Questing Knight), Aura of Authority (Hobgoblin Captain and Warlord, Emerald Claw Commander), Marshal Undead (Death Knight, Lord Soth, Necromancer Archmage; only Undead allies), Aura of Loyalty (Houndmaster Loksey; only Beasts) and Gloom Shroud. Auras that the rules switch off while the creature is Incapacitated do so.
  - **Spells**: Pass without Trace, Holy Aura, Aura of Life, Aura of Purity, Crusader's Mantle, Spirit Guardians (halves enemies' Speed), Aura of Evasion, Tranquility and Alustriel's Mooncloak. Cast the spell and apply its effect to yourself from the chat card: everyone in range gets it, and it ends when your Concentration does. Applied to anyone else, it stays a normal effect.
  - **Frostmourne** (World of Warcraft): for an attuned paladin, Numb to Cold is added to the Aura of Protection effect and Marshal Undead becomes an aura for Undead allies.
  - **Empowered Channeling** (Ravenloft bard): the Half Cover within Spirit Guardians becomes an aura you switch on by hand.
- Spells that come without an effect (Aura of Life, Aura of Purity, Crusader's Mantle, Spirit Guardians, Alustriel's Mooncloak) get one, as do Aura of Authority and Gloom Shroud.
- The setting is now called **Automatic Auras** and turns all of this off. The macro in the Aura Effects Macros compendium is now called **Set Up Automatic Auras (D&D 5e)** and sets up everything above for actors that existed before.

### Fixed
- **Unequipped items no longer radiate auras**: An aura on an item that isn't equipped, or needs attunement and isn't attuned, now switches off.

## [14.5.0] — 2026-11-19
### Added
- **Paladin auras set themselves up (D&D 5e)**: When a character gains Aura of Protection, its effect becomes a working aura right away. Allies within 10 feet get the Charisma bonus to saving throws, 30 feet once the paladin has Aura Expansion. The aura switches off while the paladin is Incapacitated, Paralyzed, Petrified, Stunned, Unconscious or dead. With several paladins, each creature gets the strongest Aura of Protection.
- **One effect for the whole aura**: Aura of Courage, Aura of Devotion, Aura of Warding and Aura of Deathly Endurance (World of Warcraft) are added to the Aura of Protection effect instead of being separate effects. Allies get a single "Protected" effect listing every benefit, and its description shows the rules text of each feature. Turning a feature's own effect off on the feature takes it back out of the aura. Removing the feature removes its benefit.
- Smite of Protection and Aura of Elemental Shielding (Heroes of Faerûn) are switched on by hand, so they stay separate auras with the same area and conditions. They stay off until you enable them.
- The 2014 versions of Aura of Protection, Courage and Devotion come without an effect and get one.
- Features that already carry an aura are left as they are, so your own aura settings survive.
- New setting **Automatic Paladin Auras** to turn this off. For paladins who had these features before this update, run the new **Set Up Paladin Auras (D&D 5e)** macro from the Aura Effects Macros compendium once. It goes through every actor and unlinked token in the world and is safe to run again.

### Fixed
- **Conditional auras react to their source's conditions**: When an aura's source gains or loses a condition through an existing effect being turned on or off, or an item, creatures inside the aura are now checked again right away instead of on their next move.

## [14.4.0] — 2026-11-18
### Changed
- **Auras respect elevation**: An aura now only reaches as far up and down as its radius. A flying creature 60 feet above a paladin no longer gets a 10-foot aura. Tall tokens count from their top as well as their feet. Existing auras pick this up the next time they are refreshed, or right away when the setting below is changed.

### Added
- **Ignore Elevation for Auras** setting: Turn it on to go back to auras that reach any height.

## [14.3.2] — 2026-11-15
### Fixed
- **Fewer "no GM logged in" warnings**: Players editing their character without a GM online (adding items, leveling up, changing effects) no longer get the warning unless auras are actually involved, meaning the character carries an aura or there is an aura on its scene. Auras still catch up as soon as a GM logs in.

## [14.3.1] — 2026-11-09
### Changed
- **French translation**: Tokens are now called « token » instead of « jeton », as in the French translations of Foundry and D&D 5e (thanks Kameleau).

## [14.3.0] — 2026-11-07
### Added
- **French translation**: The module is now available in French, reviewed by Kameleau. Thank you!

## [14.2.0] — 2026-11-06
### Changed
- **Preparing a scene no longer affects the characters in play** — Moving a player character's token on a scene that isn't active, for example while setting up the next encounter, no longer gives or takes away auras on that character. NPC tokens that aren't linked to an actor still pick up auras on any scene, so a prepared encounter is ready when it goes live.
- **Scenes with players count too** — Besides the active scene, auras on characters also work on any scene a connected player is looking at, for example when the GM pulls part of the group to another scene. If a character has tokens on several of these scenes, the one its player is looking at wins, otherwise the active scene.
- **Auras catch up when players change scenes** — When the active scene changes or a player arrives on another scene, auras are recalculated for every scene in play.

## [14.1.1] — 2026-11-04
### Removed
- Removed the French, Spanish, Japanese and Polish translations. They were machine-translated and never checked by a native speaker. Players who use Foundry in one of these languages now see this module in English. Translations by native speakers are welcome as an issue or pull request.

## [14.1.0] — 2026-11-02
### Added
- New translations: French, Spanish, Japanese and Polish. The module is now available in nine languages.
- The German, Italian, Brazilian Portuguese and Czech translations now cover the whole module.

## [14.0.0] — 2026-10-26

First release of Nik's Aura Effects, a fork of [Aura Effects](https://git.gay/roth-michael/Aura-Effects) 2.2.3 by Michael Roth. Existing aura effects, settings and worlds keep working unchanged.

### Changed
- **Auras follow the active scene** — Activating a scene now recalculates every aura on it. Characters no longer keep auras they picked up on the previous scene, and auras on the new scene are applied right away instead of after the first token move. Characters without a token on the active scene lose auras applied elsewhere.
- **Catch-up when the GM logs in** — Auras on the active scene are recalculated when a GM joins, picking up anything that changed while no GM was online.
- **Broken conditional scripts no longer apply the aura** — If an aura's conditional script throws an error, the aura is now not applied (the error is still logged to the console). Before, it was applied anyway.
- **Secret tokens count as hostile** — For Friendly/Hostile auras, tokens with Secret disposition are now treated as hostile. Two secret tokens count as allies.
- **"Only in combat" checks the token** — Combat-only auras now turn on when the emitting token is in combat, not when its actor is in a combat on another scene.

### Fixed
- **Editing an aura updates it everywhere** — Changing an aura's effects, name or icon now updates the copies already applied to tokens inside it, without them having to step out and back in.
- **GM viewing another scene** — Toggling or editing auras, updating actors, and so on now works on the active scene even while the GM (or the player making the change) is looking at a different scene.
- **Deleting a token** — A deleted character token no longer keeps the auras it was standing in.
- **Items with auras** — Equipping, unequipping, adding or deleting an item that carries an aura now adds or removes the aura immediately.
- **Aura size follows the actor** — Aura distances based on actor data (for example `@abilities.cha.mod`) now resize when the actor changes.
- **Multiple auras from one source** — A token inside several auras from the same creature now receives all of them, not just one.
- **Toggling conditions** — Enabling or disabling an effect on an actor now re-checks auras with conditional scripts.
- **Conditional scripts on unviewed scenes** — Scripts no longer fail because `token` or `sourceToken` is empty when the scene isn't on screen.
- **Duplicate tokens** — When the same character has several tokens on a scene, each aura now uses the token it actually belongs to.
- **Converting effects to auras and back** — Unsaved edits in the effect sheet are no longer lost when using Convert to Aura or Revert.
- **Non-stacking auras** — The stronger of two same-named auras is now chosen correctly when both apply at once, and the next-best aura is reapplied correctly when one is removed.
- **dnd5e transformations** — Transforming (e.g. Wild Shape or Polymorph) no longer throws an error when the actor has auras.
- **Leftover aura areas** — Fixed cases where an aura's area could stay on the scene after the aura was turned off.
- **Active Auras migration** — Worlds where walls didn't block auras now migrate correctly, and dnd4e creature type checks migrate without errors.

### Performance
- Moving tokens and other routine updates send far fewer requests to the GM, and aura areas are only rewritten when they actually change.
- Removing auras from many tokens now happens in one go per actor.
