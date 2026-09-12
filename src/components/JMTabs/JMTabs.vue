<script>
import { RouterLink } from "vue-router";
import "./jm-tabs.css";

export default {
  name: "JMTabs",
  components: { RouterLink },
  props: {
    tabs: { type: Array, required: true },
    active: { type: [String, Number], required: true },
  },
};
</script>

<template>
  <nav class="jm-tabs">
    <ul role="list">
      <li v-for="tab in tabs" :key="tab.value">
        <RouterLink v-slot="{ href, navigate }" custom :to="tab.to">
          <a
            :href="href"
            :aria-current="tab.value === active ? 'page' : undefined"
            @click="navigate"
          >
            {{ tab.text }}
          </a>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
