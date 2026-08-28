<script>
import { RouterView } from "vue-router";
import JMButton from "./components/JMButton/JMButton.vue";
import JMHeader from "./components/JMHeader/JMHeader.vue";
import JMNavigation from "./components/JMNavigation/JMNavigation.vue";

export default {
  name: "App",
  components: { JMButton, JMHeader, JMNavigation, RouterView },
  data() {
    return { syncError: "" };
  },
  mounted() {
    window.addEventListener("done-ish:sync-error", this.handleSyncError);
  },
  beforeUnmount() {
    window.removeEventListener("done-ish:sync-error", this.handleSyncError);
  },
  watch: {
    "$route.meta.title": {
      immediate: true,
      handler(title) {
        document.title = title ? `${title} — Done-ish` : "Done-ish";
      },
    },
  },
  methods: {
    handleSyncError(event) {
      this.syncError = event.detail?.message || "Changes could not be saved.";
    },
    reload() {
      window.location.reload();
    },
  },
};
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>

  <aside v-if="syncError" class="app-sync-error" role="alert">
    <p>{{ syncError }}</p>
    <JMButton text="Reload" view="secondary" @click="reload" />
  </aside>

  <JMHeader />

  <main id="main-content" tabindex="-1">
    <RouterView />
  </main>

  <JMNavigation />
</template>
