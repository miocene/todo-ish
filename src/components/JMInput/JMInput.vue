<script>
import { useId } from "vue";
import "./jm-input.css";

export default {
  name: "JMInput",
  inheritAttrs: false,
  props: {
    disabled: { type: Boolean, default: false },
    id: { type: String, default: "" },
    label: { type: String, default: "" },
    modelValue: { type: [String, Number], default: "" },
    multiline: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    suffix: { type: String, default: "" },
    size: {
      type: String,
      default: "m",
      validator: (value) => ["xs", "s", "m"].includes(value),
    },
    type: {
      type: String,
      default: "text",
      validator: (value) =>
        ["text", "number", "search", "password"].includes(value),
    },
    view: {
      type: String,
      default: "default",
      validator: (value) => ["default", "ghost"].includes(value),
    },
  },
  emits: ["update:modelValue"],
  setup() {
    return { generatedId: useId() };
  },
  computed: {
    controlId() {
      return this.id || `jm-input-${this.generatedId}`;
    },
  },
};
</script>

<template>
  <div :class="['jm-input', view, size, $attrs.class]" :style="$attrs.style">
    <label v-if="label" class="label" :for="controlId">{{ label }}</label>
    <component
      :is="multiline ? 'textarea' : 'input'"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      :id="controlId"
      :type="multiline ? undefined : type"
      :rows="multiline ? 1 : undefined"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <div v-if="suffix" class="suffix">{{ suffix }}</div>
  </div>
</template>
