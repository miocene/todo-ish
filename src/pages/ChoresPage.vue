<script>
import { loadPageTasks, nextTaskId, savePageTasks } from "../app/page-tasks.js";
import { finishTaskDraft, serializableTasks } from "../app/task-drafts.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

export default {
  name: "ChoresPage",
  components: { JMButton, JMTaskCard },
  data() {
    return { chores: loadPageTasks("chores"), draftTaskIds: new Set() };
  },
  methods: {
    taskInputId(task) {
      return `chore-title-${task.id}`;
    },
    save() {
      savePageTasks("chores", {
        ...this.chores,
        tasks: serializableTasks(this.chores.tasks, this.draftTaskIds),
      });
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateCompleted(task, completed) {
      task.completed = completed;
      this.save();
    },
    addTask() {
      const task = {
        id: nextTaskId(this.chores.tasks, "chore"),
        title: "",
        details: "Repeats weekly",
        completed: false,
      };
      this.chores.tasks.push(task);
      this.draftTaskIds.add(task.id);
      this.save();
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(task) {
      if (!finishTaskDraft(this.chores.tasks, task, this.draftTaskIds)) return;
      this.save();
    },
    handleEnter(task, event) {
      if (event.isComposing) return;
      event.preventDefault();
      const index = this.chores.tasks.findIndex((item) => item.id === task.id);
      const nextTask = this.chores.tasks[index + 1];
      if (nextTask) this.focusTask(nextTask);
      else this.addTask();
    },
    focusTask(task) {
      if (!task) return;
      this.$nextTick(() => {
        const input = document.getElementById(this.taskInputId(task));
        input?.focus();
      });
    },
  },
};
</script>

<template>
  <section class="task-page" aria-labelledby="chores-title">
    <header class="task-page__header">
      <div>
        <h1 id="chores-title">Chores</h1>
        <p>Recurring jobs around the house.</p>
      </div>
      <JMButton text="Add chore" view="secondary" @click="addTask" />
    </header>

    <ul class="task-page__tasks" role="list">
      <li v-for="task in chores.tasks" :key="task.id">
        <JMTaskCard
          :task-id="task.id"
          :title="task.title"
          :title-input-id="taskInputId(task)"
          :completed="task.completed"
          @enter="handleEnter(task, $event)"
          @title-blur="handleTitleBlur(task)"
          @update:completed="updateCompleted(task, $event)"
          @update:title="updateTitle(task, $event)"
        >
          <template #details>{{ task.details }}</template>
        </JMTaskCard>
      </li>
    </ul>
  </section>
</template>
