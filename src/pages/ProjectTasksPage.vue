<script>
import { loadPageTasks, nextTaskId, savePageTasks } from "../app/page-tasks.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

export default {
  name: "ProjectTasksPage",
  components: { JMButton, JMTaskCard },
  props: {
    description: { type: String, required: true },
    pageKey: {
      type: String,
      required: true,
      validator: (value) => ["printing", "crossStitch"].includes(value),
    },
    title: { type: String, required: true },
  },
  data() {
    return { pageData: loadPageTasks(this.pageKey) };
  },
  watch: {
    pageKey(value) {
      this.pageData = loadPageTasks(value);
    },
  },
  methods: {
    projectTitleId(project) {
      return `${this.pageKey}-project-${project.id}`;
    },
    taskInputId(project, task) {
      return `${this.pageKey}-title-${project.id}-${task.id}`;
    },
    save() {
      savePageTasks(this.pageKey, this.pageData);
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateCompleted(task, completed) {
      task.completed = completed;
      this.save();
    },
    addTask(project) {
      const task = {
        id: nextTaskId(project.tasks, `${project.id}-task`),
        title: "",
        completed: false,
      };
      project.tasks.push(task);
      this.save();
      this.focusTask(project, task);
      return task;
    },
    handleEnter(project, task, event) {
      if (event.isComposing) return;
      event.preventDefault();
      const index = project.tasks.findIndex((item) => item.id === task.id);
      const nextTask = project.tasks[index + 1];
      if (nextTask) this.focusTask(project, nextTask);
      else this.addTask(project);
    },
    focusTask(project, task) {
      if (!task) return;
      this.$nextTick(() => document.getElementById(this.taskInputId(project, task))?.focus());
    },
  },
};
</script>

<template>
  <section class="task-page" :aria-labelledby="`${pageKey}-title`">
    <header class="task-page__header">
      <div>
        <h1 :id="`${pageKey}-title`">{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
    </header>

    <ul class="project-grid" role="list">
      <li v-for="project in pageData.projects" :key="project.id">
        <article class="project-card" :aria-labelledby="projectTitleId(project)">
          <header class="project-card__header">
            <div>
              <h2 :id="projectTitleId(project)">{{ project.title }}</h2>
              <p>{{ project.description }}</p>
            </div>
            <JMButton text="Add task" view="ghost" @click="addTask(project)" />
          </header>

          <ul class="task-page__tasks" role="list">
            <li v-for="task in project.tasks" :key="task.id">
              <JMTaskCard
                :task-id="task.id"
                :title="task.title"
                :title-input-id="taskInputId(project, task)"
                :completed="task.completed"
                @enter="handleEnter(project, task, $event)"
                @update:completed="updateCompleted(task, $event)"
                @update:title="updateTitle(task, $event)"
              />
            </li>
          </ul>
        </article>
      </li>
    </ul>
  </section>
</template>
