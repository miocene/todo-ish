<script>
import { useId } from "vue";
import { navigationItems, toggleNavigationItem } from "../../app/navigation.js";
import { createPasskey, signOut } from "../../app/passkeys.js";
import { RouterLink } from "vue-router";
import JMButton from "../JMButton/JMButton.vue";
import "./jm-header.css";

export default {
  name: "JMHeader",
  components: { JMButton, RouterLink },
  emits: ["search"],
  setup() {
    return { profileMenuId: `profile-menu-${useId()}`, navigationItems, toggleNavigationItem };
  },
  data() {
    return { authBusy: false, authMessage: "" };
  },
  methods: {
    closeProfile() {
      this.$refs.profileMenu.hidePopover();
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

    <JMButton aria-label="Profile" icon-name="user" view="ghost" :popovertarget="profileMenuId" />
    <div :id="profileMenuId" ref="profileMenu" class="jm-popover jm-header__profile-menu" popover>
      <RouterLink class="jm-button ghost m" :to="{ name: 'profile' }" @click="closeProfile">Activity</RouterLink>
      <JMButton text="Add passkey" view="ghost" :disabled="authBusy" @click="addPasskey" />
      <hr />
      <button
        v-for="item in navigationItems"
        :key="item.to.name"
        class="jm-button ghost m jm-header__navigation-toggle"
        type="button"
        role="switch"
        :aria-checked="item.visible"
        @click="toggleNavigationItem(item)"
      >
        <span>{{ item.label }}</span>
        <span class="jm-header__navigation-switch" aria-hidden="true"></span>
      </button>
      <hr />
      <JMButton text="Sign out" view="ghost" :disabled="authBusy" @click="logout" />
      <p v-if="authMessage" role="status">{{ authMessage }}</p>
    </div>
  </header>
</template>
