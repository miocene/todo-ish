<script>
import JMButton from "../JMButton/JMButton.vue";

export default {
  name: "JMCatalogLoader",
  components: { JMButton },
  props: { catalog: { type: Object, required: true } },
  watch: {
    catalog: {
      immediate: true,
      handler(catalog) {
        void catalog.load();
      },
    },
  },
};
</script>

<template>
  <p v-if="catalog.state.status === 'loading'" role="status">
    Loading {{ catalog.label }}…
  </p>
  <div v-else-if="catalog.state.status === 'error'" role="alert">
    <p>{{ catalog.state.error }}</p>
    <JMButton
      :text="`Retry ${catalog.label}`"
      view="secondary"
      @click="catalog.load()"
    />
  </div>
</template>
