<script>
import { appClock } from "../app/clock.js";
import { activityLevel } from "../app/activity.js";
import { loadCardColors } from "../app/card-colors.js";
import { createCompletionMoveScheduler, finishTaskDraft, moveItemToEnd, serializableTasks } from "../app/task-list.js";
import {
  calendarDate,
  getCalendarDay,
  getWorkDateBounds,
  isIsoDate,
  isoDate,
  requestedDate,
} from "../app/work-calendar.js";
import { getWorkStatus, setWorkStatus } from "../app/work-status.js";
import { getAllWorkTasks, saveWorkTasks } from "../app/work-tasks.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMCalendar from "../components/JMCalendar/JMCalendar.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./work-page.css";

export default {
  name: "WorkPage",
  components: { JMButton, JMCalendar, JMTaskCard },
  data() {
    const workTasks = getAllWorkTasks().map((task) => ({ ...task }));
    const nextTaskId =
      workTasks.reduce((largestId, task) => {
        const taskId = /^new-(\d+)$/.exec(task.id);
        return taskId ? Math.max(largestId, Number(taskId[1])) : largestId;
      }, -1) + 1;
    return {
      calendarRangeDate: "",
      cardColors: loadCardColors([
        "backlog",
        ...workTasks.filter((task) => task.date).map((task) => `work-day:${task.date}`),
      ]),
      completionMoves: createCompletionMoveScheduler(),
      dateTransitioning: false,
      draftTaskIds: new Set(),
      nextTaskId,
      taskMoveStatus: "",
      workTasks,
    };
  },
  watch: {
    today() {
      this.rollOverIncompleteTasks();
      this.normalizeDateQuery(this.$route.query.date, requestedDate(this.$route.query.date, this.today));
    },
    focusDateIso: {
      immediate: true,
      handler(date) {
        this.cardColors = loadCardColors([`work-day:${date}`]);
      },
    },
    "$route.query.date": {
      immediate: true,
      handler: "handleDateQueryChange",
    },
  },
  computed: {
    today() {
      return calendarDate(appClock.state.today);
    },
    activityByDate() {
      const counts = new Map();
      for (const task of this.workTasks) {
        if (!task.checkedAt || !task.date) continue;
        counts.set(task.date, (counts.get(task.date) ?? 0) + 1);
      }

      return Object.fromEntries([...counts].map(([date, count]) => [date, { count, level: activityLevel(count) }]));
    },
    backlogTasks() {
      return this.workTasks.filter((task) => task.date === null);
    },
    canEditSelectedDay() {
      return this.canEditTask(this.selectedDay.iso);
    },
    dateBounds() {
      return getWorkDateBounds(this.today, this.workTasks);
    },
    firstAvailableDate() {
      return this.dateBounds.firstDate ? isoDate(this.dateBounds.firstDate) : "";
    },
    focusDate() {
      return requestedDate(this.$route.query.date, this.today);
    },
    focusDateIso() {
      return isoDate(this.focusDate);
    },
    isTodaySelected() {
      return this.focusDateIso === this.todayIso;
    },
    lastAvailableDate() {
      return isoDate(this.dateBounds.lastDate);
    },
    selectedDay() {
      return {
        ...getCalendarDay(this.focusDate, this.todayIso),
        tasks: this.workTasks.filter((task) => task.date === this.focusDateIso),
      };
    },
    todayIso() {
      return isoDate(this.today);
    },
  },
  mounted() {
    this.rollOverIncompleteTasks();
  },
  beforeUnmount() {
    this.completionMoves.clear();
  },
  methods: {
    addBacklogTask() {
      this.focusTaskTitle(this.createTask(null));
    },
    addSelectedDayTask() {
      if (this.canEditSelectedDay) this.focusTaskTitle(this.createTask(this.selectedDay.iso));
    },
    canEditTask(date) {
      return date === null || date >= this.todayIso;
    },
    createTask(date) {
      const task = { id: `new-${this.nextTaskId++}`, date, title: "" };
      this.workTasks.push(task);
      this.draftTaskIds.add(task.id);
      this.saveTasks();
      return task;
    },
    focusTaskTitle(task) {
      this.$nextTick(() => {
        const input = document.getElementById(this.taskInputId(task));
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    },
    goToday() {
      this.$refs.calendar.showDate(this.todayIso);
      const query = { ...this.$route.query };
      delete query.date;
      this.$router.push({ name: "work", query });
    },
    handleDateQueryChange(value) {
      this.normalizeDateQuery(value, requestedDate(value, this.today));
    },
    handleTaskTitleBlur(task) {
      if (!finishTaskDraft(this.workTasks, task, this.draftTaskIds, (item) => this.taskTitle(item))) return;
      this.completionMoves.cancel(task.id);
      this.saveTasks();
    },
    handleTaskTitleEnter(task, date, dayTasks, event) {
      if (event.isComposing) return;
      event.preventDefault();
      const taskIndex = dayTasks.findIndex((item) => item.id === task.id);
      const nextTask = dayTasks[taskIndex + 1] ?? this.createTask(date);
      this.focusTaskTitle(nextTask);
    },
    isTaskComplete(task) {
      return Boolean(task.checkedAt);
    },
    moveTask(task, date) {
      if (task.date === date) return;
      task.date = date;
      this.saveTasks();
      const destination = date === null ? "backlog" : date === this.todayIso ? "today" : date;
      this.taskMoveStatus = `${this.taskTitle(task) || "Untitled task"} moved to ${destination}.`;
    },
    normalizeDateQuery(value, date) {
      if (value === undefined || (isIsoDate(value) && isoDate(date) !== this.todayIso)) return;
      const query = { ...this.$route.query };
      delete query.date;
      this.$router.replace({ name: "work", query, hash: this.$route.hash });
    },
    rollOverIncompleteTasks() {
      let taskMoved = false;
      for (const task of this.workTasks) {
        if (!this.isTaskComplete(task) && task.date !== null && task.date < this.todayIso) {
          task.date = this.todayIso;
          taskMoved = true;
        }
      }
      if (taskMoved) this.saveTasks();
    },
    removeTask(task) {
      const taskIndex = this.workTasks.indexOf(task);
      if (taskIndex === -1) return;
      this.completionMoves.cancel(task.id);
      this.draftTaskIds.delete(task.id);
      this.workTasks.splice(taskIndex, 1);
      this.saveTasks();
      this.taskMoveStatus = `${this.taskTitle(task) || "Untitled task"} deleted.`;
    },
    saveTasks() {
      saveWorkTasks(serializableTasks(this.workTasks, this.draftTaskIds));
    },
    scheduleCompletedTaskMove(task, completed) {
      this.completionMoves.schedule(task.id, completed, () => {
        if (moveItemToEnd(this.workTasks, task)) this.saveTasks();
      });
    },
    setDayStatus({ date, value }) {
      setWorkStatus(date, value);
    },
    setTaskCompletion(task, completed) {
      task.checkedAt = completed ? new Date().toISOString() : undefined;
      if (completed && task.date === null) {
        task.date = this.todayIso;
      } else if (!completed && task.date !== null && task.date < this.todayIso) {
        task.date = this.todayIso;
      }
      this.saveTasks();
      this.scheduleCompletedTaskMove(task, completed);
    },
    taskCheckboxId(task) {
      return `work-task-complete-${task.id}`;
    },
    taskInputId(task) {
      return `work-task-${task.id}`;
    },
    taskTitle(task) {
      return task.title;
    },
    toggleTaskAssignment(task) {
      this.moveTask(task, task.date === null ? this.todayIso : null);
    },
    workStatusValue(date) {
      return getWorkStatus(date).value;
    },
    updateTaskTitle(task, title) {
      task.title = title;
      this.saveTasks();
    },
  },
};
</script>

<template>
  <section
    class="work-page"
    :class="{ 'work-page--date-transitioning': dateTransitioning }"
    aria-labelledby="work-page-title"
  >
    <header class="work-page__header">
      <div>
        <h1 id="work-page-title">Work</h1>
      </div>
      <JMButton
        text="Today"
        view="secondary"
        :disabled="isTodaySelected && calendarRangeDate === todayIso"
        @click="goToday"
      />
    </header>

    <JMCalendar
      ref="calendar"
      :activity="activityByDate"
      :date="focusDateIso"
      :day-type-for-date="workStatusValue"
      :max-date="lastAvailableDate"
      :min-date="firstAvailableDate"
      route-name="work"
      show-day-type
      view-transition
      @range-change="calendarRangeDate = $event"
      @update:day-type="setDayStatus"
      @view-transition="dateTransitioning = $event"
    />

    <p class="work-page__status" aria-live="polite" aria-atomic="true">{{ taskMoveStatus }}</p>

    <section
      class="work-day"
      :style="{ '--color': cardColors[`work-day:${focusDateIso}`] }"
      :class="{
        'work-day--today': selectedDay.today,
      }"
      aria-labelledby="selected-work-day-title"
      :aria-busy="dateTransitioning"
    >
      <header class="work-day__header">
        <div>
          <span class="work-day__eyebrow">{{ selectedDay.today ? "Today" : selectedDay.weekday }}</span>
          <h2 id="selected-work-day-title">
            <time :datetime="selectedDay.iso">{{ selectedDay.dateLabel }}</time>
          </h2>
        </div>

        <div class="work-day__actions">
          <JMButton text="Add task" view="secondary" :disabled="!canEditSelectedDay" @click="addSelectedDayTask" />
        </div>
      </header>

      <div class="work-day__tasks">
        <p v-if="selectedDay.tasks.length === 0" class="work-day__empty">Nothing recorded for this day.</p>
        <JMTaskCard
          v-for="task in selectedDay.tasks"
          :key="task.id"
          :task-id="task.id"
          :title="taskTitle(task)"
          :title-input-id="taskInputId(task)"
          :completion-input-id="taskCheckboxId(task)"
          :completed="isTaskComplete(task)"
          :editable="canEditTask(selectedDay.iso)"
          removable
          :pin-icon="isTaskComplete(task) ? '' : 'pinned'"
          :pin-label="`Move ${taskTitle(task) || 'untitled task'} to backlog`"
          :remove-label="`Delete ${taskTitle(task) || 'untitled task'}`"
          @enter="handleTaskTitleEnter(task, selectedDay.iso, selectedDay.tasks, $event)"
          @pin="toggleTaskAssignment(task)"
          @remove="removeTask(task)"
          @title-blur="handleTaskTitleBlur(task)"
          @update:completed="setTaskCompletion(task, $event)"
          @update:title="updateTaskTitle(task, $event)"
        />
      </div>
    </section>

    <section class="work-backlog" :style="{ '--color': cardColors.backlog }" aria-labelledby="backlog-title">
      <header class="work-backlog__header">
        <h2 id="backlog-title">Backlog</h2>
        <JMButton aria-label="Add backlog task" text="Add task" view="secondary" @click="addBacklogTask" />
      </header>
      <div class="work-backlog__tasks">
        <p v-if="backlogTasks.length === 0" class="work-backlog__empty">No backlog tasks</p>
        <JMTaskCard
          v-for="task in backlogTasks"
          :key="task.id"
          :task-id="task.id"
          :title="taskTitle(task)"
          :title-input-id="taskInputId(task)"
          :completion-input-id="taskCheckboxId(task)"
          :completed="isTaskComplete(task)"
          removable
          pin-icon="pin"
          :pin-label="`Mark ${taskTitle(task) || 'untitled task'} ready for today`"
          :remove-label="`Delete ${taskTitle(task) || 'untitled task'}`"
          @enter="handleTaskTitleEnter(task, null, backlogTasks, $event)"
          @pin="toggleTaskAssignment(task)"
          @remove="removeTask(task)"
          @title-blur="handleTaskTitleBlur(task)"
          @update:completed="setTaskCompletion(task, $event)"
          @update:title="updateTaskTitle(task, $event)"
        />
      </div>
    </section>
  </section>
</template>
