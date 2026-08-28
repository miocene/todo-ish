<script>
import { RouterLink } from "vue-router";
import { state } from "../app/store.js";
import { filterSearchRecords, searchRecords } from "../domain/search.js";

export default {
  name: "SearchPage",
  components: { RouterLink },
  props: {
    initialQuery: { type: String, default: "" },
  },
  data() {
    return { query: this.initialQuery };
  },
  computed: {
    records() {
      return searchRecords(state);
    },
    results() {
      return filterSearchRecords(this.records, this.query);
    },
  },
  watch: {
    initialQuery(value) {
      this.query = value;
    },
  },
};
</script>

<template>
  <section class="search-screen">
    <h1>Search everything.</h1>
    <form class="search-page-form" @submit.prevent>
      <label for="search-query">Search all content</label>
      <div><input id="search-query" v-model="query" type="search" placeholder="Try a project or task…" /></div>
    </form>
    <div class="search-results-list">
      <RouterLink v-for="item in results" :key="item.key" class="search-result-card" :to="item.to"
        ><span>{{ item.section }}</span>
        <h2>{{ item.label }}</h2>
        <span>Open</span></RouterLink
      >
      <p v-if="!results.length" class="empty-state">No matches.</p>
    </div>
  </section>
</template>
