<script>
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-button.css";

const viewClasses = {
  primary: "button__primary",
  secondary: "button__secondary",
  ghost: "button__ghost",
};

export default {
  name: "JMButton",
  components: { JMIcon },
  props: {
    icon: { type: String, default: "" },
    type: { type: String, default: "button" },
    view: { type: String, default: "primary" },
  },
  computed: {
    buttonClass() {
      return viewClasses[this.view] || viewClasses.primary;
    },
  },
};
</script>

<template>
  <button class="button" :class="buttonClass" :type="type">
    <JMIcon v-if="icon" :name="icon" />
    <slot />
  </button>
</template>
