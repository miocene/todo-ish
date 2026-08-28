<script>
import SectionTabs from "../components/SectionTabs.vue";
import StitchProjectCard from "../components/StitchProjectCard.vue";
import { actions, state } from "../app/store.js";
import { stitchStatusFromThreads } from "../domain/stitching.js";

export default {
  name: "StitchPage",
  components: { SectionTabs, StitchProjectCard },
  data() {
    return { draft: false, state, title: "" };
  },
  computed: {
    groups() {
      return [
        ["In progress", this.state.stitch.filter((project) => stitchStatusFromThreads(project) === "In progress")],
        ["Backlog", this.state.stitch.filter((project) => stitchStatusFromThreads(project) === "Planned")],
        ["Finished", this.state.stitch.filter((project) => stitchStatusFromThreads(project) === "Completed")],
        ["Abandoned", this.state.stitch.filter((project) => stitchStatusFromThreads(project) === "Abandoned")],
      ].filter(([, projects]) => projects.length);
    },
  },
  methods: {
    addProject() {
      if (!this.title.trim()) {
        this.draft = false;
        return;
      }
      actions.addStitchProject(this.title.trim());
      this.title = "";
      this.draft = false;
    },
    setThreadCrosses(projectId, thread, value) {
      actions.setThreadCrosses(projectId, thread.id, value);
    },
  },
};
</script>

<template>
  <section>
    <div class="section-bar">
      <SectionTabs group="make" /><button class="mini-button section-create" type="button" @click="draft = true">
        New project ＋
      </button>
    </div>
    <form v-if="draft" class="list-add-form" @submit.prevent="addProject">
      <input v-model="title" autofocus placeholder="Project name" @blur="!title && (draft = false)" /><button
        class="primary-button primary-button--compact"
      >
        Add
      </button>
    </form>
    <h1 class="sr-only">Cross-stitch projects</h1>
    <div class="stitch-project-list">
      <section v-for="[label, projects] in groups" :key="label" class="stitch-project-group">
        <header>
          <h2>{{ label }}</h2>
          <span>{{ projects.length }}</span>
        </header>
        <StitchProjectCard
          v-for="project in projects"
          :key="project.id"
          :project="project"
          :stock="state.threadStock"
          @update-crosses="(thread, value) => setThreadCrosses(project.id, thread, value)"
        />
      </section>
    </div>
  </section>
</template>
