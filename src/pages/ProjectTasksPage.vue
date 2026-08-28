<script>
import { loadPageTasks, nextTaskId, savePageTasks } from "../app/page-tasks.js";
import { completedTasksLast, finishTaskDraft, serializableTasks } from "../app/task-drafts.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

function loadProjectTasks(pageKey) {
  const pageData = loadPageTasks(pageKey);
  for (const project of pageData.projects) project.tasks = completedTasksLast(project.tasks);
  return pageData;
}

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
    return { completionMoveTimers: new Map(), draftTaskIds: new Set(), pageData: loadProjectTasks(this.pageKey) };
  },
  beforeUnmount() {
    this.clearCompletionMoveTimers();
  },
  watch: {
    pageKey(value) {
      this.clearCompletionMoveTimers();
      this.draftTaskIds.clear();
      this.pageData = loadProjectTasks(value);
    },
  },
  methods: {
    clearCompletionMoveTimers() {
      for (const timer of this.completionMoveTimers.values()) window.clearTimeout(timer);
      this.completionMoveTimers.clear();
    },
    projectTitleId(project) {
      return `${this.pageKey}-project-${project.id}`;
    },
    taskInputId(project, task) {
      return `${this.pageKey}-title-${project.id}-${task.id}`;
    },
    save() {
      savePageTasks(this.pageKey, {
        ...this.pageData,
        projects: this.pageData.projects.map((project) => ({
          ...project,
          tasks: serializableTasks(project.tasks, this.draftTaskIds),
        })),
      });
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateCompleted(project, task, completed) {
      window.clearTimeout(this.completionMoveTimers.get(task.id));
      this.completionMoveTimers.delete(task.id);
      task.completed = completed;
      this.save();
      if (!completed) return;

      const timer = window.setTimeout(() => {
        this.completionMoveTimers.delete(task.id);
        const taskIndex = project.tasks.findIndex((item) => item.id === task.id);
        if (taskIndex === -1 || taskIndex === project.tasks.length - 1) return;
        project.tasks.splice(taskIndex, 1);
        project.tasks.push(task);
        this.save();
      }, 500);
      this.completionMoveTimers.set(task.id, timer);
    },
    addTask(project) {
      const task = {
        id: nextTaskId(project.tasks, `${project.id}-task`),
        title: "",
        completed: false,
      };
      project.tasks.push(task);
      this.draftTaskIds.add(task.id);
      this.save();
      this.focusTask(project, task);
      return task;
    },
    handleTitleBlur(project, task) {
      if (!finishTaskDraft(project.tasks, task, this.draftTaskIds)) return;
      this.save();
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
                @title-blur="handleTitleBlur(project, task)"
                @update:completed="updateCompleted(project, task, $event)"
                @update:title="updateTitle(task, $event)"
              />
            </li>
          </ul>
        </article>
      </li>
    </ul>
  </section>
</template>
