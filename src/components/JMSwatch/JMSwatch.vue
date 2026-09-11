<script>
import "./jm-swatch.css";

export default {
  name: "JMSwatch",
  props: { value: { type: String, required: true } },
  computed: {
    isColor() {
      return /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(this.value);
    },
  },
};
</script>

<template>
  <span
    v-if="isColor"
    class="jm-swatch"
    :style="{ backgroundColor: value }"
    aria-hidden="true"
  />
  <img
    v-else
    class="jm-swatch"
    :src="value"
    alt=""
    width="16"
    height="16"
    loading="lazy"
  />
</template>
