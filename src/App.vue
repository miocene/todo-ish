<script>
import { RouterView } from "vue-router";
import JMHeader from "./components/JMHeader/JMHeader.vue";
import PrimaryNav from "./components/PrimaryNav.vue";
import SearchPalette from "./components/SearchPalette.vue";

export default {
  name: "App",
  components: { JMHeader, PrimaryNav, RouterView, SearchPalette },
  data() {
    return { searchOpen: false };
  },
  watch: {
    "$route.path"() {
      this.updateTitle();
      this.$nextTick(() => this.$refs.mainContent?.focus({ preventScroll: true }));
    },
  },
  mounted() {
    window.addEventListener("keydown", this.keyboard);
    this.updateTitle();
  },
  beforeUnmount() {
    window.removeEventListener("keydown", this.keyboard);
  },
  methods: {
    keyboard(event) {
      const isEditable = event.target?.closest?.("input, textarea, select, [contenteditable], [role='textbox']");
      if (event.defaultPrevented || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isEditable)
        return;

      event.preventDefault();
      this.searchOpen = true;
    },
    updateTitle() {
      document.title = this.$route.meta.title ? `${this.$route.meta.title} — Done-ish` : "Done-ish";
    },
  },
};
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <JMHeader @search="searchOpen = true" />
  <main id="main-content" ref="mainContent" tabindex="-1"><RouterView /></main>
  <PrimaryNav :section="$route.meta.section || ''" />
  <SearchPalette :open="searchOpen" @close="searchOpen = false" />
</template>
