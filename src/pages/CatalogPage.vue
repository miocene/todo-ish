<script>
import { filamentLabel, filamentProductLink, filaments } from "../app/filament-catalog.js";
import { loadFilamentInventory, loadPageTasks, saveFilamentInventory } from "../app/page-tasks.js";
import { filamentSupplyStatus, syncFilamentShoppingList } from "../app/printing-supplies.js";
import "./catalog-page.css";

export default {
  name: "CatalogPage",
  data() {
    return {
      family: "",
      filamentInventory: loadFilamentInventory(),
      filaments,
      printingProjects: loadPageTasks("printing").projects,
      query: typeof this.$route.query.q === "string" ? this.$route.query.q : "",
    };
  },
  computed: {
    families() {
      return [...new Set(this.filaments.map((filament) => filament.family))].sort((first, second) =>
        first.localeCompare(second),
      );
    },
    supplyById() {
      return filamentSupplyStatus(this.printingProjects, this.filamentInventory);
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
  },
  methods: {
    filamentLabel,
    filamentProductLink,
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
    supply(filament) {
      return this.supplyById.get(filament.id);
    },
    updateSpools(filament, value) {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      this.filamentInventory[filament.id] = count;
      saveFilamentInventory(this.filamentInventory);
      syncFilamentShoppingList(this.printingProjects, this.filamentInventory);
    },
  },
};
</script>

<template>
  <section class="catalog-page" aria-labelledby="catalog-title">
    <header class="catalog-page__header">
      <h1 id="catalog-title">Catalog</h1>
      <p>Filaments available for 3D project items. Missing project references are highlighted on the project card.</p>
    </header>

    <form class="catalog-search" action="/catalog" method="get" @submit.prevent>
      <div class="catalog-search__field">
        <label for="catalog-query">Search filaments</label>
        <input
          id="catalog-query"
          v-model="query"
          name="q"
          type="search"
          autocomplete="off"
          placeholder="Family, color, product code, or catalog ID"
        />
      </div>
      <div class="catalog-search__field">
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
  </section>
</template>
