<script>
import { RouterView } from "vue-router";
import JMHeader from "./components/JMHeader/JMHeader.vue";
import JMNavigation from "./components/JMNavigation/JMNavigation.vue";

export default {
  name: "App",
  components: { JMHeader, JMNavigation, RouterView },
  watch: {
    "$route.meta.title": {
      immediate: true,
      handler(title) {
        document.title = title ? `${title} — Done-ish` : "Done-ish";
      },
    },
  },
};
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>

  <JMHeader />

  <main id="main-content" tabindex="-1">
    <RouterView />
  </main>

  <JMNavigation />
</template>
