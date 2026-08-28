<script>
import "./jm-catalog-card.css";

export default {
  name: "JMCatalogCard",
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
    swatchColor: { type: String, default: "" },
    swatchSrc: { type: String, default: "" },
    title: { type: String, required: true },
    titleHref: { type: String, required: true },
  },
};
</script>

<template>
  <article class="catalog-card" :class="{ 'catalog-card--missing': missing }" :data-catalog-group="catalogGroup">
    <img v-if="swatchSrc" class="catalog-card__swatch" :src="swatchSrc" alt="" loading="lazy" width="48" height="48" />
    <span v-else class="catalog-card__swatch" :style="{ backgroundColor: swatchColor }" aria-hidden="true" />
    <div>
      <h2>
        <a :href="titleHref" target="_blank" rel="noopener noreferrer">
          {{ title }}
          <span class="catalog-card__visually-hidden"> (opens in a new tab)</span>
        </a>
      </h2>
      <p v-if="status" :class="{ 'catalog-card__missing': catalogGroup === 'needed' }">{{ status }}</p>
      <p v-if="detailText">{{ detailText }}</p>
      <code>{{ catalogId }}</code>
      <p v-if="requiredText" class="catalog-card__required">{{ requiredText }}</p>
      <p v-if="missingText" class="catalog-card__missing">{{ missingText }}</p>
    </div>
    <label class="catalog-card__inventory">
      <span>{{ inventoryLabel }}</span>
      <input
        :name="inventoryName"
        type="number"
        inputmode="numeric"
        min="0"
        step="1"
        :value="inventoryValue"
        @input="$emit('update:inventory', $event.target.value)"
      />
    </label>
  </article>
</template>
