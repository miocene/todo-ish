<script>
import { authenticateWithPasskey, createPasskey, passkeysSupported } from "../../app/passkeys.js";
import JMButton from "../JMButton/JMButton.vue";
import "./jm-passkey-gate.css";

export default {
  name: "JMPasskeyGate",
  components: { JMButton },
  props: {
    bootstrapRequired: { type: Boolean, required: true },
  },
  emits: ["authenticated"],
  data() {
    return {
      bootstrapToken: "",
      busy: false,
      error: "",
      supported: true,
    };
  },
  mounted() {
    this.supported = passkeysSupported();
  },
  methods: {
    async submit() {
      if (this.busy || !this.supported) return;
      if (this.bootstrapRequired && !this.bootstrapToken.trim()) {
        this.error = "Enter the one-time setup code from the home server.";
        return;
      }

      this.busy = true;
      this.error = "";
      try {
        const result = this.bootstrapRequired
          ? await createPasskey(this.bootstrapToken.trim())
          : await authenticateWithPasskey();
        this.$emit("authenticated", result.user);
      } catch (error) {
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          this.error = error?.message || "The passkey request failed.";
        }
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>

<template>
  <main class="jm-passkey-gate" aria-labelledby="passkey-title">
    <section class="jm-passkey-gate__panel" :aria-busy="busy">
      <p class="jm-passkey-gate__brand">Done-ish</p>
      <h1 id="passkey-title">{{ bootstrapRequired ? "Create your passkey" : "Welcome back" }}</h1>
      <p v-if="bootstrapRequired">
        Use the one-time setup code from the home server. After this, your passkey is all you need to sign in.
      </p>
      <p v-else>Use your passkey to open your lists.</p>

      <template v-if="supported">
        <label v-if="bootstrapRequired" class="jm-passkey-gate__field">
          <span>One-time setup code</span>
          <input
            v-model="bootstrapToken"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :disabled="busy"
            @keyup.enter="submit"
          />
        </label>

        <JMButton
          :text="bootstrapRequired ? 'Create passkey' : 'Sign in with passkey'"
          :disabled="busy"
          @click="submit"
        />
      </template>
      <p v-else role="alert">This browser does not support passkeys.</p>

      <p v-if="error" class="jm-passkey-gate__error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>
