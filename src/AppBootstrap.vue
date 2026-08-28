<script>
import { getSession } from "./app/passkeys.js";
import { initializeAppData } from "./app/app-data.js";
import { initializeFilamentCatalog } from "./app/filament-catalog.js";
import { initializeFlossCatalog } from "./app/floss-catalog.js";
import JMButton from "./components/JMButton/JMButton.vue";
import JMPasskeyGate from "./components/JMPasskeyGate/JMPasskeyGate.vue";

export default {
  name: "AppBootstrap",
  components: { JMButton, JMPasskeyGate },
  props: {
    startApplication: { type: Function, required: true },
  },
  data() {
    return {
      bootstrapRequired: false,
      error: "",
      state: "loading",
    };
  },
  mounted() {
    this.loadSession();
  },
  methods: {
    async initializeApplication() {
      await Promise.all([initializeAppData(), initializeFilamentCatalog(), initializeFlossCatalog()]);
      await this.startApplication();
    },
    async loadSession() {
      this.error = "";
      this.state = "loading";
      try {
        const session = await getSession();
        if (session.authenticated) {
          await this.initializeApplication();
          return;
        }
        this.bootstrapRequired = session.bootstrapRequired;
        this.state = "anonymous";
      } catch (error) {
        this.error = error?.message || "Done-ish could not connect to the home server.";
        this.state = "error";
      }
    },
    async handleAuthenticated() {
      this.error = "";
      this.state = "loading";
      try {
        await this.initializeApplication();
      } catch (error) {
        this.error = error?.message || "Done-ish could not load app data.";
        this.state = "error";
      }
    },
  },
};
</script>

<template>
  <p v-if="state === 'loading'" class="app-startup-status" role="status">Opening Done-ish…</p>

  <section v-else-if="state === 'error'" class="app-startup-error" role="alert">
    <p>{{ error }}</p>
    <JMButton text="Try again" @click="loadSession" />
  </section>

  <JMPasskeyGate
    v-else-if="state === 'anonymous'"
    :bootstrap-required="bootstrapRequired"
    @authenticated="handleAuthenticated"
  />
</template>
