import { DISPOSITIONS } from "./constants.mjs";
import { getActorTokens } from "./helpers.mjs";

const { BooleanField, ColorField, JavaScriptField, NumberField, StringField } = foundry.data.fields;

export default function AuraActiveEffectDataMixin(ActiveEffectClass) {
  return class AuraActiveEffectData extends ActiveEffectClass {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "AURAEFFECTS.ACTIVEEFFECT.Aura"];
    static defineSchema() {
      const schema = super.defineSchema();
      return {
        ...schema,
        applyToSelf: new BooleanField({ initial: true }),
        bestFormula: new StringField({ initial: "" }),
        canStack: new BooleanField({ initial: false }),
        collisionType: new StringField({
          choices: {
            "": "COMMON.None",
            light: "WALL.FIELDS.light.label",
            move: "WALL.FIELDS.move.label",
            sight: "WALL.FIELDS.sight.label",
            sound: "WALL.FIELDS.sound.label"
          },
          required: true,
          blank: true,
          initial: "move"
        }),
        color: new ColorField(),
        combatOnly: new BooleanField({ initial: false }),
        disableOnHidden: new BooleanField({ initial: true }),
        distanceFormula: new StringField({ initial: "0" }),
        disposition: new NumberField({
          initial: DISPOSITIONS.ANY,
          choices: {
            [DISPOSITIONS.HOSTILE]: "AURAEFFECTS.ACTIVEEFFECT.Aura.FIELDS.disposition.Choices.Hostile",
            [DISPOSITIONS.ANY]: "AURAEFFECTS.ACTIVEEFFECT.Aura.FIELDS.disposition.Choices.Any",
            [DISPOSITIONS.FRIENDLY]: "AURAEFFECTS.ACTIVEEFFECT.Aura.FIELDS.disposition.Choices.Friendly"
          }
        }),
        evaluatePreApply: new BooleanField({ initial: false }),
        overrideName: new StringField({ initial: '' }),
        script: new JavaScriptField(),
        showRadius: new BooleanField({ initial: false })
      }
    }
  
    get isSuppressed() {
      return this.isSuppressedFor(getActorTokens(this.parent.actor)[0]);
    }

    /**
     * Whether this aura is suppressed when emitted by a specific token
     * @param {TokenDocument} [token]   The emitting token
     * @returns {boolean}
     */
    isSuppressedFor(token) {
      if (super.isSuppressed) return true;
      if (this.combatOnly && !(token ?? this.parent.actor)?.inCombat) return true;
      if (this.disableOnHidden && token?.hidden) return true;
      return false;
    }
  
    get distance() {
      return new Roll(this.distanceFormula || "0", this.parent.parent?.getRollData?.()).evaluateSync({ strict: false }).total;
    }

    static migrateData(source, options, state) {
      if (!("collisionType" in source) && source.collisionTypes?.length) {
        source.collisionType = source.collisionTypes[0];
        delete source.collisionTypes;
      }
      return super.migrateData(source, options, state);
    }

    prepareDerivedData() {
      super.prepareDerivedData?.();
      // Source auras never modify their own actor; only the applied copies do
      this.changes = [];
      this.parent.statuses = new Set();
    }
  }
}