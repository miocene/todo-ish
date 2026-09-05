<script>
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-button.css";

export default {
  name: "JMButton",
  components: { JMIcon },
  props: {
    disabled: { type: Boolean, default: false },
    iconName: { type: String, default: "" },
    text: { type: String, default: "" },
    size: {
      type: String,
      default: "m",
      validator: (value) => ["s", "m"].includes(value),
    },
    view: {
      type: String,
      default: "primary",
      validator: (value) => ["primary", "secondary", "ghost"].includes(value),
    },
  },
};
</script>

<template>
  <button class="jm-button" :class="[`jm-button--${view}`, `jm-button--${size}`]" type="button" :disabled="disabled">
    <JMIcon v-if="iconName" :name="iconName" />
    {{ text }}
  </button>
</template>
