<script>
import { RouterLink } from "vue-router";
import PrintProjectCard from "../components/PrintProjectCard.vue";
import StitchProjectCard from "../components/StitchProjectCard.vue";
import { actions, state } from "../app/store.js";

export default {
  name: "ProjectDetailPage",
  components: { PrintProjectCard, RouterLink, StitchProjectCard },
  props: {
    kind: { type: String, required: true },
    id: { type: String, required: true },
  },
  data() {
    return { state };
  },
  computed: {
    project() {
      return this.kind === "printing"
        ? this.state.printing.find((item) => item.id === this.id)
        : this.state.stitch.find((item) => item.id === this.id);
    },
  },
  methods: {
    togglePart(partId) {
      actions.togglePrintPart(this.project.id, partId);
    },
    setThreadCrosses(thread, value) {
      actions.setThreadCrosses(this.project.id, thread.id, value);
    },
  },
};
</script>

<template>
  <section v-if="project">
    <RouterLink class="back-link" :to="{ name: kind === 'printing' ? 'printing' : 'cross-stitch' }">← Back</RouterLink>
    <h1 class="sr-only">{{ project.title }}</h1>
    <PrintProjectCard v-if="kind === 'printing'" :project="project" @toggle="togglePart($event.id)" /><StitchProjectCard
      v-else
      :project="project"
      :stock="state.threadStock"
      @update-crosses="setThreadCrosses"
    />
  </section>
  <section v-else class="empty-state">Project not found.</section>
</template>
