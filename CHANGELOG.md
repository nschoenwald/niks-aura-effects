# Changelog

All notable changes to Nik's Aura Effects are documented in this file.

## [14.9.0] — 2026-11-27
### Added
- **Automatic auras stay up to date (D&D 5e)**: When an update changes how an automatic aura is set up (for example its radius, its conditions, who it reaches, or the bonuses of an effect the module created), existing characters and creatures get the change the next time a GM logs in. Features and spells that newly get an automatic aura are set up then too. Anything you changed yourself on such an aura stays as you set it. The first GM login after this update goes through all actors once.

### Changed
- **Spell auras place their area again (D&D 5e)**: Circle of Power and the other spell auras no longer untick "Place Measured Template" when cast, so animations from Automated Animations or BLFX that start from the area play as before. The area is removed when your Concentration ends, and Nik's DnD5e Tweaks' auto-targeting still targets only the caster.

## [14.8.2] — 2026-11-27
### Fixed
- **Security**: Players can no longer make the GM's computer create arbitrary scene regions, delete effects that aren't aura copies, or put copies of any effect on any creature. The GM now works out aura areas itself and only copies real auras to creatures on a scene where that aura is.
- **Conditional scripts**: A script on an aura that a player can edit (for example on their own character) no longer runs on the GM's computer, where it would have full GM rights. It runs on that player's computer only; elsewhere the aura is left as it is. Scripts the module writes for automatic auras (Aura of Protection and the others) and scripts on effects only the GM can edit run everywhere as before.
- **One broken aura no longer stops all auras**: A radius or "best" formula that can't be calculated (a typo, or dice in the "best" formula) counts as 0 with a warning in the browser console. Before, it stopped auras from being applied anywhere until it was fixed.
- **Reverted auras**: Turning an aura back into a normal effect with the Revert button no longer causes errors while its area is being removed.
- **Performance**: Aura areas work out their radius once per update, and the source aura looks up its tokens only once per update.

## [14.8.1] — 2026-11-27
### Fixed
- **Spell auras don't pick up old targets (D&D 5e)**: The chat card of Circle of Power and the other spell auras without an area lists only the caster as its target. Before, it kept whatever was targeted at the time (for example the enemy of the last attack, or everyone in an earlier spell's area), and applying the effect from the card used those. Your own targets on the map are left alone. Spirit Guardians still targets as before.
- **Placing the area anyway**: If you tick the checkbox to place the spell's area, Nik's DnD5e Tweaks' auto-targeting now also targets only the caster instead of everyone in the area (needs Nik's DnD5e Tweaks 14.117.0 or later).

## [14.8.0] — 2026-11-27
### Added
- **Spell auras start on their own (D&D 5e)**: Casting Circle of Power, Pass without Trace, Holy Aura, Aura of Life, Aura of Purity, Crusader's Mantle, Spirit Guardians, Aura of Evasion, Tranquility or Alustriel's Mooncloak now puts the aura on the caster right away. No more applying the effect to yourself from the chat card.
- **No area to place**: These spells (except Spirit Guardians, whose area handles the damage) no longer place an area when cast, so Nik's DnD5e Tweaks doesn't target everyone in it and nothing is left behind. The aura shows the radius and moves with the caster. Tick the checkbox in the casting dialog to place the area anyway.

### Fixed
- **No double effect from the chat card**: Applying a spell aura's effect to targets who are already inside the caster's aura no longer gives them a second copy.

## [14.7.5] — 2026-11-27
### Fixed
- **No second Aura of Protection (D&D 5e)**: A feature or spell that already carries an aura you made yourself no longer gets an automatic one on top. The 14.7.4 setup added a second Aura of Protection to paladins with a hand-made aura; remove the one you don't want (see below).
- **Aura of Warding without an effect**: A copy of Aura of Warding without an effect now gets one (Necrotic, Psychic and Radiant resistance) and is added to the Aura of Protection like the others. Smite of Protection without an effect gets one too (Half Cover, switched off until you turn it on). The setup runs once more when a GM logs in after updating.
- **Aura of Alacrity (Oath of Glory)**: Now part of the Aura of Protection: allies in the aura get the 10 feet of Speed, not only the paladin. Keeping it until the end of their next turn after leaving stays manual.

If a paladin now has two Aura of Protection effects, open the Aura of Protection feature and delete one of them: your own if the automatic one should take over (it includes the oath auras), or the automatic one ("Aura of Protection") if you prefer yours.

## [14.7.4] — 2026-11-27
### Fixed
- **Automatic auras for existing actors (D&D 5e)**: Spells and features that actors already had (for example Circle of Power) are now set up as auras automatically, once, the first time a GM logs in after updating. Before, they stayed normal effects until someone ran the setup macro, so Circle of Power still came from its placed area and its effect didn't show on allies. Requires the **Automatic Auras** setting.
- **Circle of Power's area disappears with Concentration**: The area placed when casting Circle of Power is now removed when Concentration on the spell ends.

## [14.7.3] — 2026-11-27
### Changed
- **Faster in combat**: Damage, item uses and effect changes on a creature with an aura (or inside one) no longer re-check the aura after every single change. A burst of changes, such as one attack with several updates, is checked once at the end.
- **Less work overall**: Aura conditions only build the creature's full roll data when they use it, replacement auras are looked for only among the auras a creature is actually in, and switching scenes or a GM logging in updates all auras in one step.

## [14.7.2] — 2026-11-27
### Fixed
- **Smoother token movement**: Moving a token into or out of an aura no longer makes the movement stutter. The aura now appears or disappears when the token arrives instead of halfway through the move, and swapping one aura for another (for example leaving one paladin's Aura of Protection while inside another's) happens in a single step instead of several.

## [14.7.1] — 2026-11-27
### Fixed
- **Aura effects show on affected creatures**: Circle of Power, Aura of Protection and every other aura now always show their icon on the creatures they affect. Before, most of them were hidden because the effect's icon setting was "If temporary". Auras whose icon is set to **Never** stay hidden. Effects already applied in your world are updated once when a GM logs in.

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
