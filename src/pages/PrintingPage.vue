<script>
import PrintProjectCard from "../components/PrintProjectCard.vue";
import SectionTabs from "../components/SectionTabs.vue";
import { actions, state } from "../app/store.js";
import { isPrintProjectDone } from "../domain/printing.js";

export default {
  name: "PrintingPage",
  components: { PrintProjectCard, SectionTabs },
  data() {
    return { draft: false, state, title: "" };
  },
  computed: {
    active() {
      return this.state.printing.filter((project) => !isPrintProjectDone(project));
    },
    done() {
      return this.state.printing.filter(isPrintProjectDone);
    },
  },
  methods: {
    addProject() {
      if (!this.title.trim()) {
        this.draft = false;
        return;
      }
      actions.addPrintProject(this.title.trim());
      this.title = "";
      this.draft = false;
    },
    togglePart(projectId, partId) {
      actions.togglePrintPart(projectId, partId);
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
    <h1 class="sr-only">3D printing projects</h1>
    <div class="project-status-scroll">
      <div class="project-status-board">
        <section class="project-status-column">
          <header>
            <h2>In progress</h2>
            <span>{{ active.length }}</span>
          </header>
          <PrintProjectCard
            v-for="project in active"
            :key="project.id"
            :project="project"
            @toggle="togglePart(project.id, $event.id)"
          />
        </section>
        <section class="project-status-column">
          <header>
            <h2>Done</h2>
            <span>{{ done.length }}</span>
          </header>
          <PrintProjectCard
            v-for="project in done"
            :key="project.id"
            :project="project"
            @toggle="togglePart(project.id, $event.id)"
          />
        </section>
      </div>
    </div>
  </section>
</template>
