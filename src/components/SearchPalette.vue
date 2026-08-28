<script>
import { searchablePages } from "../app/navigation.js";
import { state } from "../app/store.js";
import { filterSearchRecords, searchRecords } from "../domain/search.js";

export default {
  name: "SearchPalette",
  props: {
    open: Boolean,
  },
  emits: ["close"],
  data() {
    return { query: "" };
  },
  computed: {
    records() {
      return [...searchablePages, ...searchRecords(state)];
    },
    results() {
      return filterSearchRecords(this.records, this.query, 12);
    },
  },
  watch: {
    async open(value) {
      const dialog = this.$refs.dialog;
      if (value && !dialog.open) {
        dialog.showModal();
        await this.$nextTick();
        this.$refs.input?.focus();
      } else if (!value && dialog.open) {
        dialog.close();
      }
    },
  },
  methods: {
    choose(to) {
      this.$emit("close");
      this.query = "";
      this.$router.push(to);
    },
    destination(to) {
      return this.$router.resolve(to).href;
    },
    close() {
      this.query = "";
      this.$emit("close");
    },
    closeFromBackdrop(event) {
      if (event.target === this.$refs.dialog) this.close();
    },
  },
};
</script>

<template>
  <dialog
    ref="dialog"
    class="command-dialog"
    aria-label="Search and commands"
    @cancel="close"
    @click="closeFromBackdrop"
  >
    <div class="command-box">
      <div class="command-input-wrap">
        <span class="command-input-wrap__icon" aria-hidden="true"></span
        ><input
          ref="input"
          v-model="query"
          type="search"
          autocomplete="off"
          aria-label="Search lists and pages"
          placeholder="Search lists or type a command…"
        /><kbd>esc</kbd>
      </div>
      <div id="command-results">
        <p class="command-group-label">Pages & results</p>
        <button v-for="item in results" :key="item.key" class="command-result" type="button" @click="choose(item.to)">
          <span aria-hidden="true">→</span
          ><span
            ><strong>{{ item.label }}</strong
            ><small>{{ destination(item.to) }}</small></span
          ><small>Open</small>
        </button>
      </div>
    </div>
  </dialog>
</template>
