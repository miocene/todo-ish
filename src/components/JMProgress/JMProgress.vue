<script>
import "./jm-progress.css";

export default {
  name: "JMProgress",
  props: {
    value: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    label: { type: String, required: true },
    text: { type: String, default: "" },
  },
};
</script>

<template>
  <div class="jm-progress">
    <progress
      class="jm-progress__bar"
      :value="max > 0 ? value : 0"
      :max="max > 0 ? max : 1"
      :aria-label="label"
      :aria-valuetext="text || undefined"
    />
    <p v-if="text" class="jm-progress__text">{{ text }}</p>
  </div>
</template>
