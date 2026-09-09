<script>
import "./jm-switch.css";

export default {
  name: "JMSwitch",
  props: {
    disabled: { type: Boolean, default: false },
    label: { type: String, required: true },
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
};
</script>

<template>
  <button
    class="jm-switch"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span>{{ label }}</span>
    <span class="jm-switch__track" aria-hidden="true"></span>
  </button>
</template>
