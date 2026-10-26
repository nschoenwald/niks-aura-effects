import { getExtendedParts, getExtendedTabs, getFormSystemData } from "./helpers.mjs";
/** @import ActiveEffectConfig from "@client/applications/sheets/active-effect-config.mjs"; */

/**
 * Extend an Active Effect Config sheet to include the Aura Effects tab & logic
 * @param {typeof ActiveEffectConfig} ActiveEffectSheet An existing Active Effect Config sheet class
 * @returns The extended sheet
 */
export default function AuraActiveEffectSheetMixin(ActiveEffectSheet) {
  const needs5eWorkaround = (game.system.id === "dnd5e") && foundry.utils.isNewerVersion(game.system.version, 6);
  return class AuraActiveEffectSheet extends ActiveEffectSheet {
    static PARTS = getExtendedParts(super.PARTS);
  
    static TABS = getExtendedTabs(super.TABS);
  
    static DEFAULT_OPTIONS = {
      actions: {
        revert: AuraActiveEffectSheet.#onRevert
      }
    };

    static {
      if (needs5eWorkaround) {
        this.DEFAULT_OPTIONS.actions.addChange = this.#onAddChange;
      }
    }
  
    async _preparePartContext(id, context) {
      context = await super._preparePartContext(id, context);
      if (id === "aura") {
        context = foundry.utils.mergeObject(context, {
          auraFields: this.document.system.schema.fields,
          isDAEEnabled: game.modules.get("dae")?.active
        }, { inplace: false });
      }
      return context;
    };
  
    static #onRevert() {
      const updates = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
      updates.type = this.document.getFlag("auraeffects", "originalType") ?? "base";
      foundry.utils.setProperty(updates, "flags.auraeffects", _del);
      // Keep any unsaved edits from the form on top of the stored system data
      updates.system = _replace(foundry.utils.mergeObject(this.document.toObject().system, getFormSystemData(updates), { inplace: false }));
      this.document.update(updates);
    }

    // dnd5e 6.0-specific overrides (until maybe system-side change?)

    async _prepareChangesContext(context, options) {
      if (!needs5eWorkaround) return super._prepareChangesContext(context, options);
      context.changes = await Promise.all(
        context.source.system.changes.map(c => this.document.getSheetChangeContext(c))
      );
      return context;
    }

    static async #onAddChange(event, target) {
      await this.submit({
        updateData: {
          system: {
            changes: [
              ...this.document.system.toObject().changes,
              this.document.system.schema.fields.changes.element.getInitialValue()
            ]
          }
        }
      });
      const app = new dnd5e.applications.activeEffect.EffectChangeConfig({
        changeId: this.document.system.toObject().changes.at(-1)._id,
        document: this.document
      });
      this._renderChild(app);
    }
  }
}