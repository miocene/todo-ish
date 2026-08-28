<script>
import SectionTabs from "../components/SectionTabs.vue";
import StockControl from "../components/StockControl.vue";
import { actions, state } from "../app/store.js";
import { bambuFilamentCatalog, bambuMaterial, dmcFlossCatalog } from "../../catalogs/catalogs.js";
import { stockOwned } from "../domain/inventory.js";

export default {
  name: "CataloguePage",
  components: { SectionTabs, StockControl },
  props: {
    kind: { type: String, required: true },
  },
  data() {
    return { query: "", state, type: "all" };
  },
  computed: {
    isFilament() {
      return this.kind === "filaments";
    },
    types() {
      return [...new Set(bambuFilamentCatalog.map((item) => this.material(item)))].sort();
    },
    stock() {
      return this.isFilament ? this.state.filamentStock : this.state.threadStock;
    },
    neededIds() {
      return new Set(
        this.state.shopping
          .filter((item) => item.linked && item.sourceType === (this.isFilament ? "filament" : "thread"))
          .map((item) => item.sourceId),
      );
    },
    entries() {
      const source = this.isFilament ? bambuFilamentCatalog : dmcFlossCatalog;
      const filtered = source.filter((item) => {
        const text =
          `${item.family || ""} ${item.color || ""} ${item.code || ""} ${item.number || ""} ${item.colorName || ""}`.toLowerCase();
        return (
          text.includes(this.query.toLowerCase()) &&
          (!this.isFilament || this.type === "all" || this.material(item) === this.type)
        );
      });
      return filtered.sort(
        (a, b) =>
          Number(this.neededIds.has(b.id)) - Number(this.neededIds.has(a.id)) ||
          Number(this.owned(b) > 0) - Number(this.owned(a) > 0) ||
          String(a.code || a.family).localeCompare(String(b.code || b.family), undefined, { numeric: true }),
      );
    },
    unit() {
      return this.isFilament ? "spools" : "skeins";
    },
  },
  methods: {
    material(item) {
      return bambuMaterial(item.family);
    },
    owned(item) {
      return stockOwned(this.stock, item.id);
    },
    label(item) {
      return this.isFilament
        ? item.color === "Catalog listing"
          ? item.family
          : `${item.family} · ${item.color}`
        : `${item.code} · ${item.colorName}`;
    },
    imageSwatch(item) {
      return /^https?:\/\//.test(item.swatch || "");
    },
    setStock(item, value) {
      actions.setStock(this.isFilament ? "filament" : "thread", item.id, value);
    },
  },
};
</script>

<template>
  <section>
    <div class="section-bar"><SectionTabs group="catalogues" /></div>
    <h1 class="sr-only">{{ isFilament ? "Bambu Lab filament catalogue" : "DMC Splijtzijde catalogue" }}</h1>
    <section class="catalogue-panel">
      <div class="catalog-filter-row">
        <label v-if="isFilament" class="catalog-filter"
          ><span>Type</span
          ><select v-model="type">
            <option value="all">All types</option>
            <option v-for="item in types" :key="item" :value="item">{{ item }}</option>
          </select></label
        ><label class="catalog-filter"
          ><span>Search</span
          ><input
            v-model="query"
            type="search"
            :placeholder="isFilament ? 'Search name, colour, or product code' : 'Search name or DMC number'"
        /></label>
      </div>
      <p class="catalog-match-count">Showing {{ entries.length }} matching {{ isFilament ? "variants" : "colours" }}</p>
      <div class="catalog-palette" :class="{ 'thread-palette': !isFilament }">
        <article
          v-for="item in entries"
          :key="item.id"
          :class="{ 'catalogue-item--needed': neededIds.has(item.id), 'catalogue-item--owned': owned(item) > 0 }"
        >
          <img
            v-if="imageSwatch(item)"
            class="material-swatch"
            :src="item.swatch"
            alt=""
            width="16"
            height="16"
            loading="lazy"
            decoding="async"
          /><span v-else class="material-swatch" :style="{ '--swatch': item.color || item.swatch || '#ddd' }"></span>
          <div>
            <strong>{{ label(item) }}</strong
            ><small v-if="isFilament">{{ item.productCode || material(item) }}</small>
          </div>
          <StockControl
            :model-value="owned(item)"
            :unit="unit"
            :label="label(item)"
            @update:model-value="setStock(item, $event)"
          />
        </article>
      </div>
    </section>
  </section>
</template>
