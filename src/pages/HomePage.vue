<script>
import JMCalendar from "../components/JMCalendar/JMCalendar.vue";
import PrintProjectCard from "../components/PrintProjectCard.vue";
import StitchProjectCard from "../components/StitchProjectCard.vue";
import TaskCard from "../components/TaskCard.vue";
import { actions, state } from "../app/store.js";
import { isPrintProjectDone } from "../domain/printing.js";
import { stitchStatusFromThreads } from "../domain/stitching.js";
import { dateKey, todayIso } from "../shared/date.js";
import "./home-page.css";

export default {
  name: "HomePage",
  components: { JMCalendar, PrintProjectCard, StitchProjectCard, TaskCard },
  props: {
    date: { type: String, required: true },
  },
  data() {
    return { dateTransitioning: false, state, today: todayIso() };
  },
  computed: {
    homeWork() {
      return this.date === this.today
        ? this.withKind(
            this.state.work.filter((item) => item.group === "today"),
            "work",
          )
        : this.state.work
            .filter((item) => dateKey(item.selectedAt) === this.date)
            .map((item) => ({ ...item, kind: "work", done: true }))
            .concat(
              this.state.workHistory
                .filter((item) => dateKey(item.endedAt) === this.date)
                .map((item) => ({ ...item, kind: "work", done: true })),
            );
    },
    homeChores() {
      return this.withKind(
        this.state.chores.filter((item) => item.due <= this.date),
        "chore",
      );
    },
    homeTodos() {
      return this.withKind(
        this.state.todos.filter((item) =>
          item.dateMode === "before" ? item.date >= this.date : item.dateMode === "on" && item.date === this.date,
        ),
        "todo",
      );
    },
    printProjects() {
      return this.state.printing.filter((project) => !isPrintProjectDone(project));
    },
    stitchProjects() {
      return this.state.stitch.filter((project) => stitchStatusFromThreads(project) === "In progress");
    },
  },
  methods: {
    withKind(items, kind) {
      return items
        .map((item) => ({ ...item, kind, done: Boolean(item.done || item.homeDone) }))
        .sort((a, b) => Number(a.done) - Number(b.done));
    },
    transition(change) {
      if (!document.startViewTransition) {
        change();
        return;
      }
      document.startViewTransition(async () => {
        change();
        await this.$nextTick();
      });
    },
    toggle(item) {
      this.transition(() => actions.toggleHome(item.kind, item.id));
    },
    togglePart(projectId, partId) {
      this.transition(() => actions.togglePrintPart(projectId, partId));
    },
    setThreadCrosses(projectId, thread, value) {
      actions.setThreadCrosses(projectId, thread.id, value);
    },
  },
};
</script>

<template>
  <h1 class="sr-only">Home</h1>

  <JMCalendar :date="date" route-name="home" view-transition @view-transition="dateTransitioning = $event" />

  <div class="home-dashboard" :class="{ 'home-dashboard--date-transitioning': dateTransitioning }">
    <TaskCard title="Work" :items="homeWork" @toggle="toggle" />
    <TaskCard title="Chores" :items="homeChores" @toggle="toggle" />
    <section class="home-projects" aria-label="In-progress projects">
      <PrintProjectCard
        v-for="project in printProjects"
        :key="project.id"
        :project="project"
        compact
        @toggle="togglePart(project.id, $event.id)"
      />
      <StitchProjectCard
        v-for="project in stitchProjects"
        :key="project.id"
        :project="project"
        :stock="state.threadStock"
        compact
        @update-crosses="(thread, value) => setThreadCrosses(project.id, thread, value)"
      />
    </section>
    <TaskCard title="To-dos" :items="homeTodos" @toggle="toggle" />
  </div>
</template>
