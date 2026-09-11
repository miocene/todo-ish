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
    <ul class="jm-tabs__list" role="list">
      <li v-for="tab in tabs" :key="tab.value">
        <RouterLink v-slot="{ href, navigate }" custom :to="tab.to">
          <a
            class="jm-tabs__link"
            :class="{ 'jm-tabs__link--active': tab.value === active }"
            :href="href"
            :aria-current="tab.value === active ? 'page' : undefined"
            @click="navigate"
            @focus="
              $event.currentTarget.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
              })
            "
          >
            {{ tab.text }}
          </a>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
