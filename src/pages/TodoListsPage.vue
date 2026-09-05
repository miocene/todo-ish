<script>
import { createTaskEditor } from "../app/task-editor.js";
import { RouterLink } from "vue-router";
import { randomCardColor } from "../app/card-colors.js";
import { loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import { completedTasksLast, nextEntityId, setTaskCompletion, serializableTasks } from "../app/task-list.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

export default {
  name: "TodoListsPage",
  components: { JMButton, JMTaskCard, RouterLink },
  data() {
    const todos = loadPageTasks("todos");
    for (const list of todos.lists) list.tasks = completedTasksLast(list.tasks);
    return {
      editor: createTaskEditor({
        save: () => this.save(),
      }),
      todos,
    };
  },
  beforeUnmount() {
    this.editor.clear();
  },
  computed: {
    activeList() {
      return this.todos.lists.find((list) => list.id === this.$route.query.list) ?? this.todos.lists[0];
    },
  },
  methods: {
    addList() {
      const list = {
        id: nextEntityId(this.todos.lists, "list"),
        title: "New list",
        color: randomCardColor(),
        tasks: [],
      };
      this.todos.lists.push(list);
      this.save();
      this.$router.push(this.listRoute(list));
    },
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
          tasks: serializableTasks(list.tasks, this.editor.drafts),
        })),
      });
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateCompleted(list, task, completed) {
      setTaskCompletion(task, completed);
      this.save();
      this.scheduleCompletedTaskMove(list, task, completed);
    },
    scheduleCompletedTaskMove(list, task, completed) {
      this.editor.scheduleMove(task, completed, list.tasks);
    },
    addTask() {
      if (!this.activeList) return;
      const task = {
        id: nextEntityId(this.activeList.tasks, `todo-${this.activeList.id}`),
        title: "",
        completed: false,
      };
      this.editor.add(this.activeList.tasks, task);
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(list, task) {
      this.editor.finish(list.tasks, task);
    },
    handleEnter(task, event) {
      this.editor.enter(this.activeList.tasks, task, event, { create: this.addTask, focus: this.focusTask });
    },
    focusTask(task) {
      if (task) this.editor.focus(this.taskInputId(task));
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
      <JMButton text="Add list" view="secondary" @click="addList" />
      <JMButton v-if="activeList" text="Add task" view="secondary" @click="addTask" />
    </header>

    <nav v-if="activeList" class="task-tabs" aria-label="Todo lists">
      <ul class="task-tabs__list" role="list">
        <li v-for="list in todos.lists" :key="list.id" :style="{ '--color': list.color }">
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

    <p v-if="!activeList">No lists yet. Add a list to get started.</p>
    <div v-else class="task-page__section" :style="{ '--color': activeList.color }">
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
