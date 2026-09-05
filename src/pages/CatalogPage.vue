<script>
import { filamentCatalog, filamentLabel, filamentProductLink, filaments } from "../app/filament-catalog.js";
import { flossCatalog, floss, flossLabel, flossProductLink } from "../app/floss-catalog.js";
import {
  loadFilamentInventory,
  loadFlossInventory,
  loadPageTasks,
  saveFilamentInventory,
  saveFlossInventory,
} from "../app/page-tasks.js";
import { filamentSupplyStatus, syncFilamentShoppingList } from "../app/printing-supplies.js";
import { flossSupplyStatus, syncFlossShoppingList } from "../app/stitching-supplies.js";
import JMCatalogStatus from "../components/JMCatalogStatus/JMCatalogStatus.vue";
import JMCatalogItem from "../components/JMCatalogItem/JMCatalogItem.vue";
import JMInput from "../components/JMInput/JMInput.vue";
import JMSelect from "../components/JMSelect/JMSelect.vue";
import JMTabs from "../components/JMTabs/JMTabs.vue";

export default {
  name: "CatalogPage",
  components: { JMCatalogItem, JMCatalogStatus, JMInput, JMSelect, JMTabs },
  data() {
    return {
      catalogTabs: [
        { value: "filament", text: "3D printing filament", to: { name: "catalog" } },
        { value: "floss", text: "DMC embroidery floss", to: { name: "catalog", query: { catalog: "floss" } } },
      ],
      catalogKind: this.$route.query.catalog === "floss" ? "floss" : "filament",
      family: "",
      filamentInventory: loadFilamentInventory(),
      filaments,
      floss,
      flossInventory: loadFlossInventory(),
      printingProjects: loadPageTasks("printing").projects,
      query: typeof this.$route.query.q === "string" ? this.$route.query.q : "",
      stitchingProjects: loadPageTasks("crossStitch").projects,
    };
  },
  computed: {
    catalog() {
      return this.isFlossCatalog ? flossCatalog : filamentCatalog;
    },
    isFlossCatalog() {
      return this.catalogKind === "floss";
    },
    families() {
      return [...new Set(this.filaments.map((filament) => filament.family))].sort((first, second) =>
        first.localeCompare(second),
      );
    },
    familyOptions() {
      return [{ value: "", text: "All types" }, ...this.families.map((family) => ({ value: family, text: family }))];
    },
    supplyById() {
      return filamentSupplyStatus(this.printingProjects, this.filamentInventory);
    },
    flossSupplyById() {
      return flossSupplyStatus(this.stitchingProjects, this.flossInventory);
    },
    filteredFilaments() {
      const query = this.query.trim().toLocaleLowerCase();
      return this.filaments
        .filter(
          (filament) =>
            (!this.family || filament.family === this.family) &&
            (!query ||
              [filament.id, filament.family, filament.color, filament.productCode]
                .filter(Boolean)
                .join(" ")
                .toLocaleLowerCase()
                .includes(query)),
        )
        .sort((first, second) => {
          const priority = this.catalogPriority(first) - this.catalogPriority(second);
          return priority || first.family.localeCompare(second.family) || first.color.localeCompare(second.color);
        });
    },
    filteredFloss() {
      const query = this.query.trim().toLocaleLowerCase();
      return this.floss
        .filter((thread) => [thread.id, thread.number, thread.colorName].join(" ").toLocaleLowerCase().includes(query))
        .sort((first, second) => {
          const priority = this.flossCatalogPriority(first) - this.flossCatalogPriority(second);
          return priority || first.number.localeCompare(second.number, undefined, { numeric: true });
        });
    },
    inventory() {
      return this.isFlossCatalog ? this.flossInventory : this.filamentInventory;
    },
    items() {
      if (this.isFlossCatalog) {
        return this.filteredFloss.map((thread) => ({
          id: thread.id,
          title: flossLabel(thread),
          href: flossProductLink(thread),
          group: this.flossCatalogGroup(thread),
          required: this.flossSupplyById.get(thread.id)?.requiredSkeins ?? 0,
        }));
      }
      return this.filteredFilaments.map((filament) => ({
        id: filament.id,
        title: filamentLabel(filament),
        href: filamentProductLink(filament),
        swatch: filament.swatch,
        group: this.catalogGroup(filament),
        required: this.supplyById.get(filament.id)?.requiredSpools ?? 0,
      }));
    },
  },
  watch: {
    "$route.query.catalog"(value) {
      this.catalogKind = value === "floss" ? "floss" : "filament";
      this.family = "";
      this.query = typeof this.$route.query.q === "string" ? this.$route.query.q : "";
    },
  },
  methods: {
    catalogGroup(filament) {
      return ["owned", "needed", "other"][this.catalogPriority(filament)];
    },
    catalogPriority(filament) {
      const ownedSpools = this.filamentInventory[filament.id] ?? 0;
      const missingSpools = this.supplyById.get(filament.id)?.missingSpools ?? 0;
      if (ownedSpools > 0 && missingSpools === 0) return 0;
      if (missingSpools > 0) return 1;
      return 2;
    },
    flossCatalogGroup(thread) {
      return ["owned", "needed", "other"][this.flossCatalogPriority(thread)];
    },
    flossCatalogPriority(thread) {
      const ownedSkeins = this.flossInventory[thread.id] ?? 0;
      const missingSkeins = this.flossSupplyById.get(thread.id)?.missingSkeins ?? 0;
      if (ownedSkeins > 0 && missingSkeins === 0) return 0;
      if (missingSkeins > 0) return 1;
      return 2;
    },
    saveInventory() {
      if (this.isFlossCatalog) {
        saveFlossInventory(this.flossInventory);
        syncFlossShoppingList(this.stitchingProjects, this.flossInventory);
      } else {
        saveFilamentInventory(this.filamentInventory);
        syncFilamentShoppingList(this.printingProjects, this.filamentInventory);
      }
    },
  },
};
</script>

<template>
  <section class="catalog-page" aria-labelledby="catalog-title">
    <header class="catalog-page__header">
      <h1 id="catalog-title">Catalog</h1>
    </header>

    <JMTabs :tabs="catalogTabs" :active="catalogKind" aria-label="Catalog" />

    <JMCatalogStatus :catalog="catalog" />

    <form class="catalog-search" action="/catalog" method="get" @submit.prevent>
      <JMInput
        id="catalog-query"
        v-model="query"
        class="catalog-search__field"
        name="q"
        type="search"
        autocomplete="off"
        :placeholder="
          isFlossCatalog ? 'DMC number, color, or catalog ID' : 'Family, color, product code, or catalog ID'
        "
      />
      <div v-if="!isFlossCatalog" class="catalog-search__field">
        <JMSelect id="catalog-family" v-model="family" name="family" :options="familyOptions" />
      </div>
      <button type="submit">Search</button>
    </form>

    <p v-if="catalog.state.status === 'ready' && items.length === 0" class="catalog-page__empty">
      {{ isFlossCatalog ? "No DMC colors match this search." : "No catalog filaments match this search." }}
    </p>
    <ul v-else class="catalog-list" role="list">
      <JMCatalogItem
        v-for="item in items"
        :key="item.id"
        v-model="inventory[item.id]"
        :item="item"
        :unit="isFlossCatalog ? 'skeins' : 'spools'"
        @update:model-value="saveInventory"
      />
    </ul>
  </section>
</template>
