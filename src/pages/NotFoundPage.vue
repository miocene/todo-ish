<script>
import { RouterLink } from "vue-router";

export default {
  name: "NotFoundPage",
  components: { RouterLink },
};
</script>

<template>
  <section class="empty-state">
    <p>That page isn’t here. <RouterLink :to="{ name: 'home' }">Back home</RouterLink></p>
  </section>
</template>
