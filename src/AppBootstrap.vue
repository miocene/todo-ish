<script>
import { markRaw } from "vue";
import { getSession } from "./app/passkeys.js";
import { initializeAppData, initializeDemoData } from "./app/app-data.js";
import JMButton from "./components/JMButton/JMButton.vue";
import JMPasskeyGate from "./components/JMPasskeyGate/JMPasskeyGate.vue";

export default {
  name: "AppBootstrap",
  components: { JMButton, JMPasskeyGate },
  props: {
    loadApplication: { type: Function, required: true },
  },
  data() {
    return {
      applicationComponent: null,
      bootstrapRequired: false,
      error: "",
      state: "loading",
    };
  },
  mounted() {
    this.loadSession();
  },
  methods: {
    async initializeApplication(user) {
      await Promise.all([initializeAppData(user), initializeDemoData()]);
      // The shell and route modules read the data cache when they are imported.
      this.applicationComponent = markRaw(await this.loadApplication());
      this.state = "ready";
    },
    async loadSession() {
      this.error = "";
      this.state = "loading";
      try {
        const session = await getSession();
        if (session.authenticated) {
          await this.initializeApplication(session.user);
          return;
        }
        this.bootstrapRequired = session.bootstrapRequired;
        this.state = "anonymous";
      } catch (error) {
        this.error = error?.message || "Done-ish could not connect to the home server.";
        this.state = "error";
      }
    },
    async handleAuthenticated(user) {
      this.error = "";
      this.state = "loading";
      try {
        await this.initializeApplication(user);
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

  <component :is="applicationComponent" v-else-if="state === 'ready'" />
</template>
