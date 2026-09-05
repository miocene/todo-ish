<script>
import JMInput from "../JMInput/JMInput.vue";
import "./jm-catalog-item.css";

export default {
  name: "JMCatalogItem",
  components: { JMInput },
  emits: ["update:inventory"],
  props: {
    catalogGroup: { type: String, required: true },
    catalogId: { type: String, required: true },
    detailText: { type: String, default: "" },
    inventoryLabel: { type: String, required: true },
    inventoryName: { type: String, required: true },
    inventoryValue: { type: Number, required: true },
    missing: { type: Boolean, default: false },
    missingText: { type: String, default: "" },
    requiredText: { type: String, default: "" },
    status: { type: String, default: "" },
    swatchSrc: { type: String, default: "" },
    title: { type: String, required: true },
    titleHref: { type: String, required: true },
  },
};
</script>

<template>
  <li class="jm-catalog-item" :class="{ 'jm-catalog-item--missing': missing }" :data-catalog-group="catalogGroup">
    <img
      v-if="swatchSrc"
      class="jm-catalog-item__swatch"
      :src="swatchSrc"
      alt=""
      loading="lazy"
      width="48"
      height="48"
    />
    <span v-else class="jm-catalog-item__swatch" aria-hidden="true" />
    <div>
      <h2>
        <a :href="titleHref" target="_blank" rel="noopener noreferrer">
          {{ title }}
          <span class="jm-catalog-item__visually-hidden"> (opens in a new tab)</span>
        </a>
      </h2>
      <p v-if="status" :class="{ 'jm-catalog-item__missing': catalogGroup === 'needed' }">{{ status }}</p>
      <p v-if="detailText">{{ detailText }}</p>
      <code>{{ catalogId }}</code>
      <p v-if="requiredText" class="jm-catalog-item__required">{{ requiredText }}</p>
      <p v-if="missingText" class="jm-catalog-item__missing">{{ missingText }}</p>
    </div>
    <JMInput
      class="jm-catalog-item__inventory"
      :label="inventoryLabel"
      :name="inventoryName"
      type="number"
      size="s"
      inputmode="numeric"
      min="0"
      step="1"
      :model-value="inventoryValue"
      @update:model-value="$emit('update:inventory', $event)"
    />
  </li>
</template>
