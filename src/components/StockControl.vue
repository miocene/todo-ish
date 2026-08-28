<script>
export default {
  name: "StockControl",
  props: {
    modelValue: { type: Number, default: 0 },
    unit: { type: String, required: true },
    label: { type: String, required: true },
  },
  emits: ["update:modelValue"],
  computed: {
    step() {
      return this.unit === "skeins" ? 0.25 : 1;
    },
  },
  methods: {
    set(value) {
      this.$emit("update:modelValue", Math.max(0, Math.round((Number(value) || 0) * 100) / 100));
    },
  },
};
</script>

<template>
  <div class="catalog-stock-control">
    <button type="button" :aria-label="`Remove one ${unit} from ${label}`" @click="set(modelValue - step)">−</button>
    <input
      :value="modelValue"
      type="number"
      min="0"
      :step="step"
      :aria-label="`${label} owned ${unit}`"
      @change="set($event.target.value)"
    />
    <span>{{ unit }}</span>
    <button type="button" :aria-label="`Add one ${unit} to ${label}`" @click="set(modelValue + step)">＋</button>
  </div>
</template>
