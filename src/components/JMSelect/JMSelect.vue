<script>
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-select.css";

export default {
  name: "JMSelect",
  components: { JMIcon },
  props: {
    disabled: { type: Boolean, default: false },
    iconOnly: { type: Boolean, default: false },
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, required: true },
    size: {
      type: String,
      default: "m",
      validator: (value) => ["s", "m"].includes(value),
    },
    view: {
      type: String,
      default: "default",
      validator: (value) => ["default", "ghost"].includes(value),
    },
  },
  emits: ["update:modelValue"],
  computed: {
    value: {
      get() {
        return this.modelValue;
      },
      set(value) {
        this.$emit("update:modelValue", value);
      },
    },
  },
};
</script>

<template>
  <select
    v-model="value"
    class="jm-select"
    :class="[`jm-select--${view}`, `jm-select--${size}`, { 'jm-select--icon-only': iconOnly }]"
    :disabled="disabled"
  >
    <!-- Vue's nesting checks do not yet recognize these native customizable-select elements. -->
    <component :is="'button'" class="jm-select__button" type="button">
      <component :is="'selectedcontent'" class="jm-select__selection" />
      <JMIcon class="jm-select__chevron" name="chevron-down" />
    </component>
    <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">
      <JMIcon v-if="option.iconName" :name="option.iconName" />
      <component :is="'span'" class="jm-select__text">{{ option.text }}</component>
      <JMIcon class="jm-select__check" name="check" />
    </option>
  </select>
</template>
