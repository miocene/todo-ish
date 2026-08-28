<script>
import { RouterLink } from "vue-router";
import { sectionNavigation } from "../app/navigation.js";

export default {
  name: "SectionTabs",
  components: { RouterLink },
  props: {
    group: { type: String, required: true },
  },
  data() {
    return { sectionNavigation };
  },
};
</script>

<template>
  <nav class="section-tabs" :aria-label="`${group} sections`">
    <RouterLink v-for="tab in sectionNavigation[group]" :key="tab.to.name" :to="tab.to">{{ tab.label }}</RouterLink>
  </nav>
</template>
