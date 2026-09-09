<script>
import { appClock } from "../../app/clock.js";
import { navigationItems } from "../../app/navigation.js";
import { RouterLink } from "vue-router";
import { getWorkStatus } from "../../app/work-status.js";
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-navigation.css";

export default {
  name: "JMNavigation",
  components: { JMIcon, RouterLink },
  data() {
    return { navigationItems };
  },
  computed: {
    visibleNavigationItems() {
      return this.navigationItems.filter((item) => item.visible);
    },
    workIcon() {
      return getWorkStatus(appClock.state.today).icon;
    },
  },
};
</script>

<template>
  <nav class="jm-navigation" aria-label="Primary">
    <ul class="list" role="list">
      <li v-for="item in visibleNavigationItems" :key="item.to.name" class="item">
        <RouterLink class="link" exact-active-class="link--active" :to="item.to">
          <JMIcon :name="item.to.name === 'work' ? workIcon : item.icon" />
          <span class="label">{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
