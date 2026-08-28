<script>
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-button.css";

const BUTTON_VIEWS = ["primary", "secondary", "ghost"];

export default {
  name: "JMButton",
  components: { JMIcon },
  props: {
    iconName: { type: String, default: "" },
    text: { type: String, default: "" },
    view: {
      type: String,
      default: "primary",
      validator: (value) => BUTTON_VIEWS.includes(value),
    },
  },
};
</script>

<template>
  <button class="jm-button" :class="`jm-button--${view}`" type="button">
    <JMIcon v-if="iconName" :name="iconName" />
    <span v-if="text">{{ text }}</span>
  </button>
</template>
