<script>
import { loadPageTasks, nextTaskId, savePageTasks } from "../app/page-tasks.js";
import { finishTaskDraft, serializableTasks } from "../app/task-drafts.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

export default {
  name: "ShoppingPage",
  components: { JMButton, JMTaskCard },
  data() {
    return { draftTaskIds: new Set(), shopping: loadPageTasks("shopping") };
  },
  methods: {
    taskInputId(task) {
      return `shopping-title-${task.id}`;
    },
    save() {
      savePageTasks("shopping", {
        ...this.shopping,
        tasks: serializableTasks(this.shopping.tasks, this.draftTaskIds),
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
    removeTask(task) {
      this.draftTaskIds.delete(task.id);
      this.shopping.tasks = this.shopping.tasks.filter((item) => item.id !== task.id);
      this.save();
    },
    addTask() {
      const task = {
        id: nextTaskId(this.shopping.tasks, "shopping"),
        title: "",
        completed: false,
      };
      this.shopping.tasks.push(task);
      this.draftTaskIds.add(task.id);
      this.save();
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(task) {
      if (!finishTaskDraft(this.shopping.tasks, task, this.draftTaskIds)) return;
      this.save();
    },
    handleEnter(task, event) {
      if (event.isComposing) return;
      event.preventDefault();
      const index = this.shopping.tasks.findIndex((item) => item.id === task.id);
      const nextTask = this.shopping.tasks[index + 1];
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
  <section class="task-page" aria-labelledby="shopping-title">
    <header class="task-page__header">
      <div>
        <h1 id="shopping-title">Shopping cart</h1>
        <p>Everything to pick up on the next shop.</p>
      </div>
      <JMButton text="Add item" view="secondary" @click="addTask" />
    </header>

    <p v-if="shopping.tasks.length === 0" class="task-page__empty">The shopping list is empty.</p>
    <ul v-else class="task-page__tasks" role="list">
      <li v-for="task in shopping.tasks" :key="task.id">
        <JMTaskCard
          :task-id="task.id"
          :title="task.title"
          :title-input-id="taskInputId(task)"
          :completed="task.completed"
          removable
          :remove-label="`Remove ${task.title || 'untitled item'} from shopping list`"
          @enter="handleEnter(task, $event)"
          @remove="removeTask(task)"
          @title-blur="handleTitleBlur(task)"
          @update:completed="updateCompleted(task, $event)"
          @update:title="updateTitle(task, $event)"
        />
      </li>
    </ul>
  </section>
</template>
