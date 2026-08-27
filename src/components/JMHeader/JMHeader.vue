<script>
import { RouterLink } from "vue-router";
import "./jm-header.css";

export default {
  name: "JMHeader",
  components: { RouterLink },
  emits: ["profile", "search"],
};
</script>

<template>
  <header class="jm-header">
    <div class="jm-header__inner">
      <RouterLink class="jm-header__logo" :to="{ name: 'work' }" aria-label="ToDo-ish, Work">
        <span class="jm-header__logo-main">ToDo</span><span class="jm-header__logo-suffix">-ish</span>
      </RouterLink>

      <div class="jm-header__actions">
        <button class="jm-header__button" type="button" aria-label="Search" @click="$emit('search')">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 4 4" />
          </svg>
        </button>

        <button class="jm-header__button" type="button" aria-label="Profile" @click="$emit('profile')">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>
