<script>
import { useId } from "vue";
import { navigationItems, toggleNavigationItem } from "../../app/navigation.js";
import { createPasskey, signOut } from "../../app/passkeys.js";
import { RouterLink } from "vue-router";
import JMButton from "../JMButton/JMButton.vue";
import JMSwitch from "../JMSwitch/JMSwitch.vue";
import "./jm-header.css";

export default {
  name: "JMHeader",
  components: { JMButton, JMSwitch, RouterLink },
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

    <JMButton aria-label="Profile" icon-name="user" view="ghost" :popovertarget="profileMenuId" />
    <div :id="profileMenuId" ref="profileMenu" class="jm-popover jm-header__profile-menu" popover>
      <RouterLink class="jm-button clear" :to="{ name: 'profile' }" @click="closeProfile">Activity</RouterLink>
      <JMButton text="Add passkey" view="clear" :disabled="authBusy" @click="addPasskey" />
      <hr />
      <JMSwitch
        v-for="item in navigationItems"
        :key="item.to.name"
        :label="item.label"
        :model-value="item.visible"
        @update:model-value="toggleNavigationItem(item)"
      />
      <hr />
      <JMButton text="Sign out" view="clear" :disabled="authBusy" @click="logout" />
      <p v-if="authMessage" role="status">{{ authMessage }}</p>
    </div>
  </header>
</template>
