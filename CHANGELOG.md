# Changelog

All notable changes to Nik's Aura Effects are documented in this file.

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
