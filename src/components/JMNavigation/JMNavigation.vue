<script>
import { RouterLink } from "vue-router";
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-navigation.css";

const navigationItems = [
  { icon: "work", label: "Work", to: { name: "work" } },
  { icon: "chores", label: "Chores" },
  { icon: "todo", label: "Todo lists" },
  { icon: "shopping", label: "Shopping cart" },
  { icon: "printer", label: "3D printing" },
  { icon: "yarn", label: "Cross stitch" },
  { icon: "catalog", label: "Catalog" },
];

export default {
  name: "JMNavigation",
  components: { JMIcon, RouterLink },
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
          <JMIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
        <span v-else class="jm-navigation__link jm-navigation__link--disabled" aria-disabled="true">
          <JMIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </span>
      </li>
    </ul>
  </nav>
</template>
