<script>
import { RouterLink } from "vue-router";
import { loadPageTasks, nextTaskId, savePageTasks } from "../app/page-tasks.js";
import { completedTasksLast, finishTaskDraft, serializableTasks } from "../app/task-drafts.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

export default {
  name: "TodoListsPage",
  components: { JMButton, JMTaskCard, RouterLink },
  data() {
    const todos = loadPageTasks("todos");
    for (const list of todos.lists) list.tasks = completedTasksLast(list.tasks);
    return { completionMoveTimers: new Map(), draftTaskIds: new Set(), todos };
  },
  beforeUnmount() {
    for (const timer of this.completionMoveTimers.values()) window.clearTimeout(timer);
  },
  computed: {
    activeList() {
      return this.todos.lists.find((list) => list.id === this.$route.query.list) ?? this.todos.lists[0];
    },
  },
  methods: {
    listRoute(list) {
      return { name: "todos", query: list.id === this.todos.lists[0].id ? {} : { list: list.id } };
    },
    taskInputId(task) {
      return `todo-title-${this.activeList.id}-${task.id}`;
    },
    save() {
      savePageTasks("todos", {
        ...this.todos,
        lists: this.todos.lists.map((list) => ({
          ...list,
          tasks: serializableTasks(list.tasks, this.draftTaskIds),
        })),
      });
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateCompleted(list, task, completed) {
      task.completed = completed;
      this.save();
      this.scheduleCompletedTaskMove(list, task, completed);
    },
    scheduleCompletedTaskMove(list, task, completed) {
      window.clearTimeout(this.completionMoveTimers.get(task.id));
      this.completionMoveTimers.delete(task.id);
      if (!completed) return;

      const timer = window.setTimeout(() => {
        this.completionMoveTimers.delete(task.id);
        const taskIndex = list.tasks.findIndex((item) => item.id === task.id);
        if (taskIndex === -1 || taskIndex === list.tasks.length - 1) return;
        list.tasks.splice(taskIndex, 1);
        list.tasks.push(task);
        this.save();
      }, 500);
      this.completionMoveTimers.set(task.id, timer);
    },
    addTask() {
      const task = {
        id: nextTaskId(this.activeList.tasks, `todo-${this.activeList.id}`),
        title: "",
        completed: false,
      };
      this.activeList.tasks.push(task);
      this.draftTaskIds.add(task.id);
      this.save();
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(list, task) {
      if (!finishTaskDraft(list.tasks, task, this.draftTaskIds)) return;
      this.save();
    },
    handleEnter(task, event) {
      if (event.isComposing) return;
      event.preventDefault();
      const index = this.activeList.tasks.findIndex((item) => item.id === task.id);
      const nextTask = this.activeList.tasks[index + 1];
      if (nextTask) this.focusTask(nextTask);
      else this.addTask();
    },
    focusTask(task) {
      if (!task) return;
      this.$nextTick(() => document.getElementById(this.taskInputId(task))?.focus());
    },
  },
};
</script>

<template>
  <section class="task-page" aria-labelledby="todos-title">
    <header class="task-page__header">
      <div>
        <h1 id="todos-title">Todo lists</h1>
        <p>A general inbox and focused lists for everything else.</p>
      </div>
      <JMButton text="Add task" view="secondary" @click="addTask" />
    </header>

    <nav class="task-tabs" aria-label="Todo lists">
      <ul class="task-tabs__list" role="list">
        <li v-for="list in todos.lists" :key="list.id">
          <RouterLink v-slot="{ href, navigate }" custom :to="listRoute(list)">
            <a
              class="task-tabs__link"
              :class="{ 'task-tabs__link--active': list.id === activeList.id }"
              :href="href"
              :aria-current="list.id === activeList.id ? 'page' : undefined"
              @click="navigate"
            >
              {{ list.title }}
            </a>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="task-page__section">
      <h2 :id="`todo-list-${activeList.id}`">{{ activeList.title }}</h2>
      <ul class="task-page__tasks" role="list">
        <li v-for="task in activeList.tasks" :key="task.id">
          <JMTaskCard
            :task-id="task.id"
            :title="task.title"
            :title-input-id="taskInputId(task)"
            :completed="task.completed"
            @enter="handleEnter(task, $event)"
            @title-blur="handleTitleBlur(activeList, task)"
            @update:completed="updateCompleted(activeList, task, $event)"
            @update:title="updateTitle(task, $event)"
          />
        </li>
      </ul>
    </div>
  </section>
</template>
