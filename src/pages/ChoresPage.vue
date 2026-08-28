<script>
import { loadPageTasks, nextTaskId, savePageTasks } from "../app/page-tasks.js";
import { finishTaskDraft, serializableTasks } from "../app/task-drafts.js";
import { calendarDate, isoDate } from "../app/work-calendar.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

const DUE_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export default {
  name: "ChoresPage",
  components: { JMButton, JMTaskCard },
  data() {
    return { chores: loadPageTasks("chores"), completionMoveTimers: new Map(), draftTaskIds: new Set() };
  },
  beforeUnmount() {
    for (const timer of this.completionMoveTimers.values()) window.clearTimeout(timer);
  },
  computed: {
    todayIso() {
      return isoDate(new Date());
    },
    upcomingChores() {
      const tasksById = new Map(this.chores.tasks.map((task) => [task.id, task]));
      return this.chores.occurrenceOrder.map((taskId) => tasksById.get(taskId)).filter((task) => task?.title.trim());
    },
  },
  methods: {
    taskInputId(task) {
      return `chore-title-${task.id}`;
    },
    ruleInputId(task) {
      return `chore-rule-${task.id}`;
    },
    dueLabel(task) {
      if (task.nextDue === this.todayIso) return "Today";
      const tomorrow = calendarDate();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (task.nextDue === isoDate(tomorrow)) return "Tomorrow";
      return DUE_DATE_FORMATTER.format(calendarDate(task.nextDue));
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
    updateRule(task, details) {
      task.details = details;
      this.save();
    },
    updateCompleted(task, completed) {
      window.clearTimeout(this.completionMoveTimers.get(task.id));
      this.completionMoveTimers.delete(task.id);
      task.completed = completed;
      this.save();
      if (!completed) return;

      const timer = window.setTimeout(() => {
        this.completionMoveTimers.delete(task.id);
        const taskIndex = this.chores.occurrenceOrder.indexOf(task.id);
        if (taskIndex === -1 || taskIndex === this.chores.occurrenceOrder.length - 1) return;
        this.chores.occurrenceOrder.splice(taskIndex, 1);
        this.chores.occurrenceOrder.push(task.id);
        this.save();
      }, 500);
      this.completionMoveTimers.set(task.id, timer);
    },
    addTask() {
      const task = {
        id: nextTaskId(this.chores.tasks, "chore"),
        title: "",
        details: "Repeats weekly",
        nextDue: this.todayIso,
        completed: false,
      };
      this.chores.tasks.push(task);
      this.chores.occurrenceOrder.push(task.id);
      this.draftTaskIds.add(task.id);
      this.save();
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(task) {
      if (!finishTaskDraft(this.chores.tasks, task, this.draftTaskIds)) return;
      const taskIndex = this.chores.occurrenceOrder.indexOf(task.id);
      if (taskIndex !== -1) this.chores.occurrenceOrder.splice(taskIndex, 1);
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
    </header>

    <section class="task-page__section chores-upcoming" aria-labelledby="upcoming-chores-title">
      <h2 id="upcoming-chores-title">Today and upcoming</h2>
      <ul class="task-page__tasks" role="list">
        <li v-for="task in upcomingChores" :key="`occurrence-${task.id}`">
          <JMTaskCard
            :task-id="`occurrence-${task.id}`"
            :title="task.title"
            :completed="task.completed"
            :editable="false"
            @update:completed="updateCompleted(task, $event)"
          >
            <template #details>
              <time :datetime="task.nextDue">{{ dueLabel(task) }}</time>
              <span aria-hidden="true"> · </span>
              <span>{{ task.details }}</span>
            </template>
          </JMTaskCard>
        </li>
      </ul>
    </section>

    <section class="task-page__section chores-all" aria-labelledby="all-chores-title">
      <header class="task-page__section-header">
        <h2 id="all-chores-title">All chores</h2>
        <JMButton text="Add chore" view="secondary" @click="addTask" />
      </header>
      <ul class="task-page__tasks" role="list">
        <li v-for="task in chores.tasks" :key="task.id">
          <JMTaskCard
            :task-id="task.id"
            :title="task.title"
            :title-input-id="taskInputId(task)"
            :completable="false"
            @enter="handleEnter(task, $event)"
            @title-blur="handleTitleBlur(task)"
            @update:title="updateTitle(task, $event)"
          >
            <template #details>
              <label class="task-item__visually-hidden" :for="ruleInputId(task)">
                Repeating rule for {{ task.title || "untitled chore" }}
              </label>
              <input
                :id="ruleInputId(task)"
                class="chore-rule"
                name="chore-repeat-rule"
                :value="task.details"
                @input="updateRule(task, $event.target.value)"
              />
            </template>
          </JMTaskCard>
        </li>
      </ul>
    </section>
  </section>
</template>
