<script>
import { RouterView } from "vue-router";

export default {
  name: "App",
  components: { RouterView },
  mounted() {
    document.title = "Calendar — Done-ish";
  },
};
</script>

<template>
  <main><RouterView /></main>
</template>
