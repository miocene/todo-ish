<script>
import "./catalog-page.css";
import { subscribeAppData } from "../app/app-data.js";
import {
  filamentCatalog,
  filamentSearchIndex,
} from "../app/filament-catalog.js";
import { flossCatalog, flossSearchIndex } from "../app/floss-catalog.js";
import {
  loadFilamentInventory,
  loadFlossInventory,
  loadPageTasks,
  saveFilamentInventory,
  saveFlossInventory,
} from "../app/page-tasks.js";
import {
  filamentSupplyStatus,
  syncFilamentShoppingList,
} from "../app/printing-supplies.js";
import {
  flossSupplyStatus,
  syncFlossShoppingList,
} from "../app/stitching-supplies.js";
import JMCatalogLoader from "../components/JMCatalogLoader/JMCatalogLoader.vue";
import JMCatalogItem from "../components/JMCatalogItem/JMCatalogItem.vue";
import JMInput from "../components/JMInput/JMInput.vue";
import JMSelect from "../components/JMSelect/JMSelect.vue";
import JMTabs from "../components/JMTabs/JMTabs.vue";

export default {
  name: "CatalogPage",
  components: { JMCatalogItem, JMCatalogLoader, JMInput, JMSelect, JMTabs },
  data() {
    return {
      catalogTabs: [
        {
          value: "filament",
          text: "3D printing filament",
          to: { name: "catalog" },
        },
        {
          value: "floss",
          text: "DMC embroidery floss",
          to: { name: "catalog", query: { catalog: "floss" } },
        },
      ],
      catalogKind: this.$route.query.catalog === "floss" ? "floss" : "filament",
      family:
        typeof this.$route.query.family === "string"
          ? this.$route.query.family
          : "",
      filamentInventory: loadFilamentInventory(),
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
      return [
        ...new Set(
          filamentSearchIndex.value.map((filament) => filament.family),
        ),
      ].sort((first, second) => first.localeCompare(second));
    },
    familyOptions() {
      return [
        { value: "", text: "All types" },
        ...this.families.map((family) => ({ value: family, text: family })),
      ];
    },
    supplyById() {
      return filamentSupplyStatus(
        this.printingProjects,
        this.filamentInventory,
      );
    },
    flossSupplyById() {
      return flossSupplyStatus(this.stitchingProjects, this.flossInventory);
    },
    inventory() {
      return this.isFlossCatalog ? this.flossInventory : this.filamentInventory;
    },
    orderedItems() {
      const groups = [[], [], []];
      const rows = this.isFlossCatalog
        ? flossSearchIndex.value
        : filamentSearchIndex.value;
      for (const item of rows) groups[this.catalogPriority(item)].push(item);
      return groups.flat();
    },
    items() {
      const query = this.query.trim().toLocaleLowerCase();
      return this.orderedItems
        .filter(
          (item) =>
            (this.isFlossCatalog ||
              !this.family ||
              item.family === this.family) &&
            item.searchText.includes(query),
        )
        .map((item) => ({
          id: item.id,
          title: item.title,
          href: item.href,
          swatch: item.swatch,
          group: this.catalogGroup(item),
          required: this.isFlossCatalog
            ? (this.flossSupplyById.get(item.id)?.requiredSkeins ?? 0)
            : (this.supplyById.get(item.id)?.requiredSpools ?? 0),
        }));
    },
  },
  watch: {
    "$route.query"(value) {
      this.catalogKind = value.catalog === "floss" ? "floss" : "filament";
      this.family = typeof value.family === "string" ? value.family : "";
      this.query = typeof value.q === "string" ? value.q : "";
    },
  },
  mounted() {
    this.subscriptions = [
      subscribeAppData("printing", (value) => {
        this.printingProjects = value.projects;
      }),
      subscribeAppData("cross-stitch", (value) => {
        this.stitchingProjects = value.projects;
      }),
      subscribeAppData("filament-inventory", (value) => {
        this.filamentInventory = value;
      }),
      subscribeAppData("floss-inventory", (value) => {
        this.flossInventory = value;
      }),
    ];
  },
  beforeUnmount() {
    for (const unsubscribe of this.subscriptions) unsubscribe();
  },
  methods: {
    search() {
      const query = this.query.trim();
      this.$router.push({
        name: "catalog",
        query: {
          ...(this.isFlossCatalog && { catalog: "floss" }),
          ...(query && { q: query }),
          ...(!this.isFlossCatalog && this.family && { family: this.family }),
        },
      });
    },
    catalogGroup(filament) {
      return ["owned", "needed", "other"][this.catalogPriority(filament)];
    },
    catalogPriority(item) {
      const owned = this.inventory[item.id] ?? 0;
      const missing = this.isFlossCatalog
        ? (this.flossSupplyById.get(item.id)?.missingSkeins ?? 0)
        : (this.supplyById.get(item.id)?.missingSpools ?? 0);
      return missing > 0 ? 1 : owned > 0 ? 0 : 2;
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

    <JMCatalogLoader :catalog="catalog" />

    <form
      class="catalog-search"
      action="/catalog"
      method="get"
      @submit.prevent="search"
    >
      <JMInput
        id="catalog-query"
        v-model="query"
        class="catalog-search__field"
        name="q"
        type="search"
        autocomplete="off"
        :aria-label="isFlossCatalog ? 'Search floss' : 'Search filaments'"
        :placeholder="
          isFlossCatalog
            ? 'DMC number, color, or catalog ID'
            : 'Family, color, product code, or catalog ID'
        "
      />
      <div v-if="!isFlossCatalog" class="catalog-search__field">
        <JMSelect
          id="catalog-family"
          v-model="family"
          name="family"
          aria-label="Filament type"
          :options="familyOptions"
        />
      </div>
      <button type="submit">Search</button>
    </form>

    <p
      v-if="catalog.state.status === 'ready' && items.length === 0"
      class="catalog-page__empty"
    >
      {{
        isFlossCatalog
          ? "No DMC colors match this search."
          : "No catalog filaments match this search."
      }}
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
