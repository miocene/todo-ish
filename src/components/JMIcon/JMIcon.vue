<script>
import iconSpriteUrl from "./icons.svg";
import "./jm-icon.css";

export default {
  name: "JMIcon",
  props: {
    name: { type: String, required: true },
    label: { type: String, default: "" },
  },
  computed: {
    iconHref() {
      return `${iconSpriteUrl}#icon-${this.name}`;
    },
  },
};
</script>

<template>
  <svg
    class="jm-icon"
    viewBox="0 0 16 16"
    :aria-hidden="label ? undefined : 'true'"
    :aria-label="label || undefined"
    :role="label ? 'img' : undefined"
    focusable="false"
  >
    <title v-if="label">{{ label }}</title>
    <use :href="iconHref" />
  </svg>
</template>
