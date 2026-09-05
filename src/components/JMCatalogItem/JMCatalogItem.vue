<script>
import JMInput from "../JMInput/JMInput.vue";
import "./jm-catalog-item.css";

export default {
  name: "JMCatalogItem",
  components: { JMInput },
  props: {
    item: { type: Object, required: true },
    modelValue: { type: Number, default: 0 },
    unit: {
      type: String,
      required: true,
      validator: (value) => ["skeins", "spools"].includes(value),
    },
  },
  emits: ["update:modelValue"],
  methods: {
    updateQuantity(value) {
      this.$emit("update:modelValue", Math.max(0, Math.floor(Number(value) || 0)));
    },
  },
};
</script>

<template>
  <li
    class="jm-catalog-item"
    :class="{ 'jm-catalog-item--missing': item.group === 'needed' }"
    :data-catalog-group="item.group"
  >
    <img
      v-if="item.swatch"
      class="jm-catalog-item__swatch"
      :src="item.swatch"
      alt=""
      loading="lazy"
      width="48"
      height="48"
    />
    <span v-else class="jm-catalog-item__swatch" aria-hidden="true" />
    <h2>
      <a :href="item.href" target="_blank" rel="noopener noreferrer">
        {{ item.title }}
        <span class="jm-catalog-item__visually-hidden"> (opens in a new tab)</span>
      </a>
    </h2>
    <div class="jm-catalog-item__inventory">
      <JMInput
        class="jm-catalog-item__quantity"
        :aria-label="`${unit === 'skeins' ? 'Skeins' : 'Spools'} owned for ${item.title}`"
        :aria-describedby="item.required > 0 ? `catalog-required-${item.id}` : undefined"
        :name="`${unit}-owned`"
        type="number"
        size="s"
        inputmode="numeric"
        min="0"
        step="1"
        :model-value="modelValue"
        @update:model-value="updateQuantity"
      />
      <template v-if="item.required > 0">
        <span class="jm-catalog-item__required" aria-hidden="true">/ {{ item.required }}</span>
        <span :id="`catalog-required-${item.id}`" class="jm-catalog-item__visually-hidden">
          Required {{ unit }}: {{ item.required }}
        </span>
      </template>
    </div>
  </li>
</template>
