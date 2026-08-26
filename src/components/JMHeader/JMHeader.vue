<script>
import { RouterLink } from "vue-router";
import JMButton from "../JMButton/JMButton.vue";
import "./jm-header.css";

export default {
  name: "JMHeader",
  components: { JMButton, RouterLink },
  emits: ["search"],
};
</script>

<template>
  <header class="header">
    <RouterLink class="header__brand" :to="{ name: 'home' }" aria-label="Done-ish, home">
      <span class="header__brand-main">Done</span><span class="header__brand-ish">-ish</span>
    </RouterLink>

    <JMButton icon="search" view="ghost" aria-label="Search and commands" @click="$emit('search')">
      <kbd>/</kbd>
    </JMButton>

    <RouterLink class="header__avatar" :to="{ name: 'settings' }" aria-label="Open settings" />
  </header>
</template>
