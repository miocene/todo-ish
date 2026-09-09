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
      validator: (value) => ["xs", "s", "m"].includes(value),
    },
    view: {
      type: String,
      default: "default",
      validator: (value) => ["default", "ghost"].includes(value),
    },
  },
  emits: ["update:modelValue"],
  computed: {
    selectedOption() {
      return this.options.find((option) => String(option.value) === String(this.modelValue));
    },
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
  <select v-model="value" :class="['jm-select', view, size]" :disabled="disabled">
    <component :is="'button'" class="button" type="button">
      <span v-if="selectedOption?.swatch" class="selection">
        <img class="swatch" :src="selectedOption.swatch" alt="" width="16" height="16" />
        <span class="text">{{ selectedOption.text }}</span>
      </span>
      <component v-else :is="'selectedcontent'" class="selection" />
      <JMIcon class="chevron" name="chevron-down" />
    </component>
    <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">
      <img v-if="option.swatch" class="swatch" :src="option.swatch" alt="" width="16" height="16" loading="lazy" />
      <JMIcon v-if="option.iconName" :name="option.iconName" />
      <component :is="'span'" class="text">{{ option.text }}</component>
    </option>
  </select>
</template>
