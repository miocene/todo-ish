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
import "./catalog-page.css";

export default {
  name: "CatalogPage",
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
    supply(filament) {
      return this.supplyById.get(filament.id);
    },
    flossSupply(thread) {
      return this.flossSupplyById.get(thread.id);
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
        <li v-for="thread in filteredFloss" :key="thread.id">
          <article
            class="filament-card"
            :class="{ 'filament-card--missing': (flossSupply(thread)?.missingSkeins ?? 0) > 0 }"
            :data-catalog-group="flossCatalogGroup(thread)"
          >
            <span class="filament-card__swatch" :style="{ backgroundColor: thread.color }" aria-hidden="true" />
            <div>
              <h2>
                <a :href="flossProductLink(thread)" target="_blank" rel="noopener noreferrer">
                  {{ flossLabel(thread) }}
                  <span class="catalog-page__visually-hidden"> (opens in a new tab)</span>
                </a>
              </h2>
              <p v-if="flossCatalogGroup(thread) === 'owned'" class="filament-card__status">In stock</p>
              <p v-else-if="flossCatalogGroup(thread) === 'needed'" class="filament-card__missing">Needed</p>
              <code>{{ thread.id }}</code>
              <p v-if="flossSupply(thread)" class="filament-card__required">
                Required {{ flossSupply(thread).requiredSkeins }}
                {{ flossSupply(thread).requiredSkeins === 1 ? "skein" : "skeins" }}
              </p>
              <p v-if="(flossSupply(thread)?.missingSkeins ?? 0) > 0" class="filament-card__missing">
                Missing {{ flossSupply(thread).missingSkeins }}
                {{ flossSupply(thread).missingSkeins === 1 ? "skein" : "skeins" }}
              </p>
            </div>
            <label class="filament-card__inventory">
              <span>Skeins owned</span>
              <input
                name="skeins-owned"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                :value="flossInventory[thread.id] ?? 0"
                @input="updateSkeins(thread, $event.target.value)"
              />
            </label>
          </article>
        </li>
      </ul>
    </template>

    <template v-else>
      <p class="catalog-page__count" aria-live="polite">
        {{ filteredFilaments.length }} {{ filteredFilaments.length === 1 ? "filament" : "filaments" }}
      </p>

      <p v-if="filteredFilaments.length === 0" class="catalog-page__empty">No catalog filaments match this search.</p>
      <ul v-else class="filament-catalog" role="list">
        <li v-for="filament in filteredFilaments" :key="filament.id">
          <article
            class="filament-card"
            :class="{ 'filament-card--missing': (supply(filament)?.missingSpools ?? 0) > 0 }"
            :data-catalog-group="catalogGroup(filament)"
          >
            <img class="filament-card__swatch" :src="filament.swatch" alt="" loading="lazy" width="48" height="48" />
            <div>
              <h2>
                <a :href="filamentProductLink(filament)" target="_blank" rel="noopener noreferrer">
                  {{ filamentLabel(filament) }}
                  <span class="catalog-page__visually-hidden"> (opens in a new tab)</span>
                </a>
              </h2>
              <p v-if="catalogGroup(filament) === 'owned'" class="filament-card__status">In stock</p>
              <p v-else-if="catalogGroup(filament) === 'needed'" class="filament-card__missing">Needed</p>
              <p v-if="filament.productCode">Product {{ filament.productCode }}</p>
              <code>{{ filament.id }}</code>
              <p v-if="supply(filament)" class="filament-card__required">
                Required {{ supply(filament).requiredGrams }} g · {{ supply(filament).requiredSpools }}
                {{ supply(filament).requiredSpools === 1 ? "spool" : "spools" }}
              </p>
              <p v-if="(supply(filament)?.missingSpools ?? 0) > 0" class="filament-card__missing">
                Missing {{ supply(filament).missingSpools }}
                {{ supply(filament).missingSpools === 1 ? "spool" : "spools" }}
              </p>
            </div>
            <label class="filament-card__inventory">
              <span>Spools owned</span>
              <input
                name="spools-owned"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                :value="filamentInventory[filament.id] ?? 0"
                @input="updateSpools(filament, $event.target.value)"
              />
            </label>
          </article>
        </li>
      </ul>
    </template>
  </section>
</template>
