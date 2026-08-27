<script>
import { RouterLink } from "vue-router";
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-header.css";

export default {
  name: "JMHeader",
  components: { JMIcon, RouterLink },
  emits: ["profile", "search"],
};
</script>

<template>
  <header class="jm-header">
    <RouterLink class="jm-header__logo" :to="{ name: 'work' }" aria-label="ToDo-ish, Work">
      <span class="jm-header__logo-main">ToDo</span><span class="jm-header__logo-suffix">-ish</span>
    </RouterLink>

    <div class="jm-header__actions">
      <button class="jm-header__button" type="button" aria-label="Search" @click="$emit('search')">
        <JMIcon name="search" />
      </button>

      <button class="jm-header__button" type="button" aria-label="Profile" @click="$emit('profile')">
        <JMIcon name="user" />
      </button>
    </div>
  </header>
</template>
