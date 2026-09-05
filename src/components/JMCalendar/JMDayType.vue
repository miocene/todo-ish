<script>
import { WORK_STATUSES } from "../../app/work-status.js";
import JMIcon from "../JMIcon/JMIcon.vue";

const DISPLAY_ORDER = ["conference", "work", "sick-leave", "pto", "business-trip", "holiday", "weekend"];

export default {
  name: "JMDayType",
  components: { JMIcon },
  data() {
    return { open: false };
  },
  props: {
    activityLevel: {
      type: Number,
      default: 0,
      validator: (value) => Number.isInteger(value) && value >= 0 && value <= 4,
    },
    dateLabel: { type: String, required: true },
    description: { type: String, default: "" },
    disabled: Boolean,
    editable: { type: Boolean, default: true },
    inputId: { type: String, required: true },
    modelValue: {
      type: String,
      required: true,
      validator: (value) => WORK_STATUSES.some((status) => status.value === value),
    },
  },
  emits: ["activate", "update:modelValue"],
  computed: {
    options() {
      return DISPLAY_ORDER.map((value) => WORK_STATUSES.find((status) => status.value === value));
    },
    selectedOption() {
      return WORK_STATUSES.find((status) => status.value === this.modelValue);
    },
  },
  mounted() {
    document.addEventListener("pointerdown", this.closeFromOutside);
  },
  beforeUnmount() {
    document.removeEventListener("pointerdown", this.closeFromOutside);
  },
  methods: {
    close(returnFocus = false) {
      if (!this.$refs.details?.open) return;
      this.$refs.details.open = false;
      if (returnFocus) this.$refs.trigger.focus();
    },
    closeFromOutside(event) {
      if (!this.$refs.details?.contains(event.target)) this.close();
    },
    selectOption(value) {
      this.$emit("update:modelValue", value);
      this.close(true);
    },
    toggle() {
      this.$refs.details.open = !this.$refs.details.open;
    },
  },
};
</script>

<template>
  <button
    v-if="!editable"
    class="jm-day-type jm-day-type--static"
    type="button"
    :disabled="disabled"
    @click="$emit('activate')"
  >
    <span class="jm-day-type__icon" :data-level="activityLevel">
      <JMIcon :name="selectedOption.icon" />
    </span>
    <span v-if="$slots.default" class="jm-day-type__content">
      <slot />
    </span>
  </button>
  <details
    v-else
    ref="details"
    class="jm-day-type"
    @keydown.esc.prevent.stop="close(true)"
    @toggle="open = $event.target.open"
  >
    <summary
      ref="trigger"
      class="jm-day-type__trigger"
      role="button"
      :aria-expanded="open"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent
      @keyup.space.prevent="toggle"
    >
      <span class="jm-day-type__visually-hidden">
        Change day type for {{ dateLabel }}. Current type: {{ selectedOption.label
        }}<template v-if="description">. {{ description }}</template>
      </span>
      <span class="jm-day-type__icon" :data-level="activityLevel" aria-hidden="true">
        <JMIcon :name="selectedOption.icon" />
      </span>
      <span v-if="$slots.default" class="jm-day-type__content" aria-hidden="true">
        <slot />
      </span>
    </summary>

    <fieldset class="jm-day-type__menu">
      <legend class="jm-day-type__visually-hidden">Day type for {{ dateLabel }}</legend>
      <label
        v-for="option in options"
        :key="option.value"
        class="jm-day-type__option"
        :for="`${inputId}-${option.value}`"
      >
        <input
          :id="`${inputId}-${option.value}`"
          class="jm-day-type__input"
          type="radio"
          :name="inputId"
          :value="option.value"
          :checked="option.value === modelValue"
          @change="selectOption(option.value)"
        />
        <span class="jm-day-type__option-content">
          <JMIcon :name="option.icon" />
          <span class="jm-day-type__option-label">{{ option.label }}</span>
          <JMIcon v-if="option.value === modelValue" class="jm-day-type__check" name="check" />
        </span>
      </label>
    </fieldset>
  </details>
</template>
