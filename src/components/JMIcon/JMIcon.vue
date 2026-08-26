<script>
import iconSpriteUrl from "./icons.svg";
import "./jm-icon.css";

const iconNames = [
  "home",
  "make",
  "todo",
  "plus",
  "catalogues",
  "search",
  "chevron-left",
  "chevron-right",
  "check",
  "star",
  "kebab-menu",
  "edit",
  "close",
  "star-fill",
  "settings",
  "shopping-bag",
  "calendar",
  "printer",
  "yarn",
];

export default {
  name: "JMIcon",
  props: {
    name: {
      type: String,
      required: true,
      validator: (value) => iconNames.includes(value),
    },
    label: {
      type: String,
      default: "",
    },
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
    class="icon"
    viewBox="0 0 16 16"
    :aria-hidden="label ? undefined : 'true'"
    :aria-label="label || undefined"
    :role="label ? 'img' : undefined"
    focusable="false"
  >
    <use :href="iconHref" />
  </svg>
</template>
