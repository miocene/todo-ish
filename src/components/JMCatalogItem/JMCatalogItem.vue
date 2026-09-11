<script>
import JMSwatch from "../JMSwatch/JMSwatch.vue";
import { APP_DATA_LIMITS } from "../../../backend/api/src/app-data-contract.mjs";
import JMInput from "../JMInput/JMInput.vue";
import "./jm-catalog-item.css";

export default {
  name: "JMCatalogItem",
  components: { JMSwatch, JMInput },
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
  data() {
    return {
      quantityInput: null,
      quantityError: "",
      maxQuantity: APP_DATA_LIMITS.quantity,
    };
  },
  watch: {
    modelValue() {
      if (!this.quantityError) this.quantityInput = null;
    },
  },
  methods: {
    updateQuantity(value) {
      this.quantityInput = value;
      const count = Number(value);
      if (
        !Number.isInteger(count) ||
        count < 0 ||
        count > APP_DATA_LIMITS.quantity
      ) {
        this.quantityError = "Enter a whole number between 0 and 10,000,000.";
        return;
      }
      this.quantityError = "";
      this.$emit("update:modelValue", count);
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
    <JMSwatch
      v-if="item.swatch"
      class="jm-catalog-item__swatch"
      :value="item.swatch"
    />
    <span v-else class="jm-catalog-item__swatch" aria-hidden="true" />
    <h2>
      <a :href="item.href" target="_blank" rel="noopener noreferrer">
        {{ item.title }}
        <span class="sr-only"> (opens in a new tab)</span>
      </a>
    </h2>
    <div class="jm-catalog-item__inventory">
      <JMInput
        class="jm-catalog-item__quantity"
        :aria-label="`${unit === 'skeins' ? 'Skeins' : 'Spools'} owned for ${item.title}`"
        :aria-describedby="
          item.required > 0 ? `catalog-required-${item.id}` : undefined
        "
        :name="`${unit}-owned`"
        type="number"
        size="s"
        inputmode="numeric"
        min="0"
        step="1"
        :max="maxQuantity"
        :model-value="quantityInput ?? modelValue"
        @update:model-value="updateQuantity"
      />
      <p v-if="quantityError" role="alert">{{ quantityError }}</p>
      <template v-if="item.required > 0">
        <span class="jm-catalog-item__required" aria-hidden="true"
          >/ {{ item.required }}</span
        >
        <span :id="`catalog-required-${item.id}`" class="sr-only">
          Required {{ unit }}: {{ item.required }}
        </span>
      </template>
    </div>
  </li>
</template>
