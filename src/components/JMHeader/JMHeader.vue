<script>
import { useId } from "vue";
import { createPasskey, signOut } from "../../app/passkeys.js";
import { RouterLink } from "vue-router";
import JMButton from "../JMButton/JMButton.vue";
import "./jm-header.css";

export default {
  name: "JMHeader",
  components: { JMButton, RouterLink },
  emits: ["search"],
  setup() {
    return { profileMenuId: `profile-menu-${useId()}` };
  },
  data() {
    return { authBusy: false, authMessage: "" };
  },
  methods: {
    closeProfile() {
      this.$refs.profileMenu.hidePopover();
    },
    positionProfile(event) {
      if (event.newState !== "open") return;
      const rect = this.$refs.profileButton.$el.getBoundingClientRect();
      event.target.style.top = `${rect.bottom + 8}px`;
      event.target.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    },
    async addPasskey() {
      this.authBusy = true;
      this.authMessage = "";
      try {
        await createPasskey();
        this.authMessage = "Passkey added.";
      } catch (error) {
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          this.authMessage = error?.message || "The passkey could not be added.";
        }
      } finally {
        this.authBusy = false;
      }
    },
    async logout() {
      this.authBusy = true;
      this.authMessage = "";
      try {
        await signOut();
        window.location.assign("/");
      } catch (error) {
        this.authMessage = error?.message || "Could not sign out.";
        this.authBusy = false;
      }
    },
  },
};
</script>

<template>
  <header class="jm-header">
    <RouterLink class="logo" :to="{ name: 'work' }" aria-label="toto-ish, work">
      <span class="logo-main">todo</span><span class="logo-suffix">-ish</span>
    </RouterLink>

    <JMButton aria-label="Search" icon-name="search" view="ghost" @click="$emit('search')" />

    <JMButton ref="profileButton" aria-label="Profile" icon-name="user" view="ghost" :popovertarget="profileMenuId" />
    <div :id="profileMenuId" ref="profileMenu" class="jm-header__profile-menu" popover @beforetoggle="positionProfile">
      <RouterLink class="jm-button ghost m" :to="{ name: 'profile' }" @click="closeProfile">Activity</RouterLink>
      <JMButton text="Add passkey" view="ghost" :disabled="authBusy" @click="addPasskey" />
      <JMButton text="Sign out" view="ghost" :disabled="authBusy" @click="logout" />
      <p v-if="authMessage" role="status">{{ authMessage }}</p>
    </div>
  </header>
</template>
