<script>
import { RouterLink } from "vue-router";
import { getWorkStatus } from "../../app/work-status.js";
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-navigation.css";

const navigationItems = [
  { icon: "work", label: "Work", to: { name: "work" } },
  { icon: "chores", label: "Chores", to: { name: "chores" } },
  { icon: "todo", label: "Todo lists", to: { name: "todos" } },
  { icon: "shopping", label: "Shopping cart", to: { name: "shopping" } },
  { icon: "printer", label: "3D printing", to: { name: "printing" } },
  { icon: "yarn", label: "Cross stitch", to: { name: "cross-stitch" } },
  { icon: "catalog", label: "Catalog", to: { name: "catalog" } },
];

function todayIso() {
  const today = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export default {
  name: "JMNavigation",
  components: { JMIcon, RouterLink },
  data() {
    return { navigationItems, today: todayIso() };
  },
  computed: {
    workIcon() {
      return getWorkStatus(this.today).icon;
    },
  },
};
</script>

<template>
  <nav class="jm-navigation" aria-label="Primary">
    <ul class="jm-navigation__list" role="list">
      <li v-for="item in navigationItems" :key="item.label" class="jm-navigation__item">
        <RouterLink class="jm-navigation__link" exact-active-class="jm-navigation__link--active" :to="item.to">
          <JMIcon :name="item.to.name === 'work' ? workIcon : item.icon" />
          <span class="jm-navigation__label">{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
