<script>
import { RouterLink } from "vue-router";
import "./jm-navigation.css";

const navigationItems = [
  { label: "Work", to: { name: "work" } },
  { label: "Chores" },
  { label: "Todo lists" },
  { label: "Shopping cart" },
  { label: "3D printing" },
  { label: "Cross stitch" },
  { label: "Catalog" },
];

export default {
  name: "JMNavigation",
  components: { RouterLink },
  data() {
    return { navigationItems };
  },
};
</script>

<template>
  <nav class="jm-navigation" aria-label="Primary">
    <ul class="jm-navigation__list" role="list">
      <li v-for="item in navigationItems" :key="item.label" class="jm-navigation__item">
        <RouterLink
          v-if="item.to"
          class="jm-navigation__link"
          exact-active-class="jm-navigation__link--active"
          :to="item.to"
        >
          {{ item.label }}
        </RouterLink>
        <span v-else class="jm-navigation__link jm-navigation__link--disabled" aria-disabled="true">
          {{ item.label }}
        </span>
      </li>
    </ul>
  </nav>
</template>
