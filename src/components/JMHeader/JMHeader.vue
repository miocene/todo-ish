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
  <header class="jm-header">
    <RouterLink class="jm-header__logo" :to="{ name: 'work' }" aria-label="ToDo-ish, Work">
      <span class="jm-header__logo-main">ToDo</span><span class="jm-header__logo-suffix">-ish</span>
    </RouterLink>

    <JMButton aria-label="Search" icon-name="search" view="ghost" @click="$emit('search')" />

    <JMButton aria-label="Profile" icon-name="user" view="ghost" @click="$router.push({ name: 'profile' })" />
  </header>
</template>
