<script>
import { filamentLabel, filamentProductLink, filaments } from "../app/filament-catalog.js";
import { floss, flossLabel, flossProductLink } from "../app/floss-catalog.js";
import {
  loadFilamentInventory,
  loadFlossInventory,
  loadPageTasks,
  saveFilamentInventory,
  saveFlossInventory,
} from "../app/page-tasks.js";
import { filamentSupplyStatus, syncFilamentShoppingList } from "../app/printing-supplies.js";
import { flossSupplyStatus, syncFlossShoppingList } from "../app/stitching-supplies.js";
import JMCatalogCard from "../components/JMCatalogCard/JMCatalogCard.vue";
import "./catalog-page.css";

export default {
  name: "CatalogPage",
  components: { JMCatalogCard },
  data() {
    return {
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
    isFlossCatalog() {
      return this.catalogKind === "floss";
    },
    families() {
      return [...new Set(this.filaments.map((filament) => filament.family))].sort((first, second) =>
        first.localeCompare(second),
      );
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
    filamentCards() {
      return this.filteredFilaments.map((filament) => {
        const supply = this.supplyById.get(filament.id);
        const group = this.catalogGroup(filament);
        const missingSpools = supply?.missingSpools ?? 0;
        return {
          catalogGroup: group,
          catalogId: filament.id,
          detailText: filament.productCode ? `Product ${filament.productCode}` : "",
          inventoryValue: this.filamentInventory[filament.id] ?? 0,
          item: filament,
          missing: missingSpools > 0,
          missingText: missingSpools ? `Missing ${missingSpools} ${missingSpools === 1 ? "spool" : "spools"}` : "",
          requiredText: supply
            ? `Required ${supply.requiredGrams} g · ${supply.requiredSpools} ${supply.requiredSpools === 1 ? "spool" : "spools"}`
            : "",
          status: group === "owned" ? "In stock" : group === "needed" ? "Needed" : "",
          title: filamentLabel(filament),
          titleHref: filamentProductLink(filament),
        };
      });
    },
    flossCards() {
      return this.filteredFloss.map((thread) => {
        const supply = this.flossSupplyById.get(thread.id);
        const group = this.flossCatalogGroup(thread);
        const missingSkeins = supply?.missingSkeins ?? 0;
        return {
          catalogGroup: group,
          catalogId: thread.id,
          inventoryValue: this.flossInventory[thread.id] ?? 0,
          item: thread,
          missing: missingSkeins > 0,
          missingText: missingSkeins ? `Missing ${missingSkeins} ${missingSkeins === 1 ? "skein" : "skeins"}` : "",
          requiredText: supply
            ? `Required ${supply.requiredSkeins} ${supply.requiredSkeins === 1 ? "skein" : "skeins"}`
            : "",
          status: group === "owned" ? "In stock" : group === "needed" ? "Needed" : "",
          title: flossLabel(thread),
          titleHref: flossProductLink(thread),
        };
      });
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
    filamentLabel,
    filamentProductLink,
    flossLabel,
    flossProductLink,
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
    updateSpools(filament, value) {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      this.filamentInventory[filament.id] = count;
      saveFilamentInventory(this.filamentInventory);
      syncFilamentShoppingList(this.printingProjects, this.filamentInventory);
    },
    updateSkeins(thread, value) {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      this.flossInventory[thread.id] = count;
      saveFlossInventory(this.flossInventory);
      syncFlossShoppingList(this.stitchingProjects, this.flossInventory);
    },
  },
};
</script>

<template>
  <section class="catalog-page" aria-labelledby="catalog-title">
    <header class="catalog-page__header">
      <h1 id="catalog-title">Catalog</h1>
      <p v-if="isFlossCatalog">
        DMC thread colors for cross-stitch projects. Stocked colors appear first, followed by colors you need.
      </p>
      <p v-else>
        Filaments available for 3D project items. Missing project references are highlighted on the project card.
      </p>
    </header>

    <nav class="catalog-tabs" aria-label="Catalog">
      <ul>
        <li>
          <RouterLink
            class="catalog-tabs__link"
            :class="{ 'catalog-tabs__link--active': !isFlossCatalog }"
            :to="{ name: 'catalog' }"
            :aria-current="!isFlossCatalog ? 'page' : undefined"
          >
            3D printing filament
          </RouterLink>
        </li>
        <li>
          <RouterLink
            class="catalog-tabs__link"
            :class="{ 'catalog-tabs__link--active': isFlossCatalog }"
            :to="{ name: 'catalog', query: { catalog: 'floss' } }"
            :aria-current="isFlossCatalog ? 'page' : undefined"
          >
            DMC embroidery floss
          </RouterLink>
        </li>
      </ul>
    </nav>

    <form class="catalog-search" action="/catalog" method="get" @submit.prevent>
      <div class="catalog-search__field">
        <label for="catalog-query">Search {{ isFlossCatalog ? "floss" : "filaments" }}</label>
        <input
          id="catalog-query"
          v-model="query"
          name="q"
          type="search"
          autocomplete="off"
          :placeholder="
            isFlossCatalog ? 'DMC number, color, or catalog ID' : 'Family, color, product code, or catalog ID'
          "
        />
      </div>
      <div v-if="!isFlossCatalog" class="catalog-search__field">
        <label for="catalog-family">Filament type</label>
        <select id="catalog-family" v-model="family" name="family">
          <option value="">All types</option>
          <option v-for="filamentFamily in families" :key="filamentFamily" :value="filamentFamily">
            {{ filamentFamily }}
          </option>
        </select>
      </div>
      <button type="submit">Search</button>
    </form>

    <template v-if="isFlossCatalog">
      <p class="catalog-page__count" aria-live="polite">
        {{ filteredFloss.length }} {{ filteredFloss.length === 1 ? "color" : "colors" }}
      </p>

      <p v-if="filteredFloss.length === 0" class="catalog-page__empty">No DMC colors match this search.</p>
      <ul v-else class="filament-catalog" role="list">
        <li v-for="card in flossCards" :key="card.catalogId">
          <JMCatalogCard
            :catalog-group="card.catalogGroup"
            :catalog-id="card.catalogId"
            inventory-label="Skeins owned"
            inventory-name="skeins-owned"
            :inventory-value="card.inventoryValue"
            :missing="card.missing"
            :missing-text="card.missingText"
            :required-text="card.requiredText"
            :status="card.status"
            :swatch-color="card.item.color"
            :title="card.title"
            :title-href="card.titleHref"
            @update:inventory="updateSkeins(card.item, $event)"
          />
        </li>
      </ul>
    </template>

    <template v-else>
      <p class="catalog-page__count" aria-live="polite">
        {{ filteredFilaments.length }} {{ filteredFilaments.length === 1 ? "filament" : "filaments" }}
      </p>

      <p v-if="filteredFilaments.length === 0" class="catalog-page__empty">No catalog filaments match this search.</p>
      <ul v-else class="filament-catalog" role="list">
        <li v-for="card in filamentCards" :key="card.catalogId">
          <JMCatalogCard
            :catalog-group="card.catalogGroup"
            :catalog-id="card.catalogId"
            :detail-text="card.detailText"
            inventory-label="Spools owned"
            inventory-name="spools-owned"
            :inventory-value="card.inventoryValue"
            :missing="card.missing"
            :missing-text="card.missingText"
            :required-text="card.requiredText"
            :status="card.status"
            :swatch-src="card.item.swatch"
            :title="card.title"
            :title-href="card.titleHref"
            @update:inventory="updateSpools(card.item, $event)"
          />
        </li>
      </ul>
    </template>
  </section>
</template>
