<script>
export default {
  name: "PlaceholderPage",
  props: {
    title: { type: String, required: true },
  },
};
</script>

<template>
  <section>
    <h1>{{ title }}</h1>
    <p>This page is coming soon.</p>
  </section>
</template>
