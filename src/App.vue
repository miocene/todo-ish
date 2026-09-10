<script>
import { appClock } from "./app/clock.js";
import { RouterView } from "vue-router";
import {
  syncState,
  retryPendingWrites,
  retryAppDataRefresh,
  downloadPendingWrites,
  discardPendingWrites,
  startAppDataRefresh,
} from "./app/app-data.js";
import JMButton from "./components/JMButton/JMButton.vue";
import JMHeader from "./components/JMHeader/JMHeader.vue";
import JMNavigation from "./components/JMNavigation/JMNavigation.vue";

export default {
  name: "App",
  components: { JMButton, JMHeader, JMNavigation, RouterView },
  data() {
    return { syncState };
  },
  mounted() {
    appClock.start();
    this.stopDataRefresh = startAppDataRefresh();
  },
  beforeUnmount() {
    appClock.stop();
    this.stopDataRefresh();
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
    retryPendingWrites,
    retryAppDataRefresh,
    downloadPendingWrites,
    discardAndReload() {
      discardPendingWrites();
      window.location.reload();
    },
    reload() {
      window.location.reload();
    },
  },
};
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>

  <p class="app-sync-status" role="status">{{ syncState.state === "saving" ? syncState.message : "" }}</p>
  <aside
    v-if="!syncState.durable || syncState.corrupt.length || !['saved', 'saving'].includes(syncState.state)"
    class="app-sync-error"
    role="alert"
  >
    <p v-if="!['saved', 'saving'].includes(syncState.state)">{{ syncState.message }}</p>
    <p v-if="syncState.corrupt.length">
      Some local edits could not be read. Download your edits to preserve the original records.
    </p>
    <p v-if="!syncState.durable">Local backup is unavailable. Keep this tab open or download your edits.</p>
    <JMButton text="Retry" view="secondary" @click="retryPendingWrites" />
    <JMButton text="Download local edits" view="secondary" @click="downloadPendingWrites" />
    <JMButton v-if="syncState.durable" text="Reload" view="secondary" @click="reload" />
    <JMButton
      v-if="syncState.state === 'conflict'"
      text="Discard local edits and reload"
      view="secondary"
      @click="discardAndReload"
    />
  </aside>

  <aside v-if="syncState.refreshMessage" class="app-sync-error" role="alert">
    <p>{{ syncState.refreshMessage }}</p>
    <JMButton text="Retry refresh" view="secondary" @click="retryAppDataRefresh" />
  </aside>

  <JMHeader />

  <main id="main-content" tabindex="-1">
    <RouterView />
  </main>

  <JMNavigation />
</template>
