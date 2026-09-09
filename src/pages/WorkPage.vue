<script>
import { createTaskEditor } from "../app/task-editor.js";
import { appClock } from "../app/clock.js";
import { activityLevel } from "../app/activity.js";
import { loadCardColors } from "../app/card-colors.js";
import { setTaskCompletion as completeTask, serializableTasks } from "../app/task-list.js";
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
import JMCard from "../components/JMCard/JMCard.vue";
import JMCalendar from "../components/JMCalendar/JMCalendar.vue";
import JMTaskItem from "../components/JMTaskItem/JMTaskItem.vue";

export default {
  name: "WorkPage",
  components: { JMButton, JMCalendar, JMCard, JMTaskItem },
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
      editor: createTaskEditor({
        save: () => this.saveTasks(),
      }),
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
        if (!task.completedAt || !task.date) continue;
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
    this.editor.clear();
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
      return this.editor.add(this.workTasks, { id: `new-${this.nextTaskId++}`, date, title: "", completed: false });
    },
    focusTaskTitle(task) {
      this.editor.focus(this.taskInputId(task), { caretAtEnd: true });
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
      this.editor.finish(this.workTasks, task);
    },
    handleTaskTitleEnter(task, date, dayTasks, event) {
      this.editor.enter(dayTasks, task, event, {
        create: () => this.focusTaskTitle(this.createTask(date)),
        focus: this.focusTaskTitle,
      });
    },
    isTaskComplete(task) {
      return task.completed;
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
      this.editor.moves.cancel(task.id);
      this.editor.drafts.delete(task.id);
      this.workTasks.splice(taskIndex, 1);
      this.saveTasks();
      this.taskMoveStatus = `${this.taskTitle(task) || "Untitled task"} deleted.`;
    },
    saveTasks() {
      saveWorkTasks(serializableTasks(this.workTasks, this.editor.drafts));
    },
    scheduleCompletedTaskMove(task, completed) {
      this.editor.scheduleMove(task, completed, this.workTasks);
    },
    setDayStatus({ date, value }) {
      setWorkStatus(date, value);
    },
    setTaskCompletion(task, completed) {
      completeTask(task, completed);
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
      this.moveTask(task, task.date === null ? this.focusDateIso : null);
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
  <header class="page-header">
    <h1>Work</h1>
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
    @range-change="calendarRangeDate = $event"
    @update:day-type="setDayStatus"
  />

  <p class="work-page__status" aria-live="polite" aria-atomic="true">{{ taskMoveStatus }}</p>

  <JMCard
    :title="`${selectedDay.today ? 'Today' : selectedDay.weekday}, ${selectedDay.dateLabel}`"
    empty-text="Nothing recorded for this day"
    :color="cardColors[`work-day:${focusDateIso}`]"
    :actions="canEditSelectedDay ? [{ id: 'add', label: 'Add task', icon: 'plus' }] : []"
    @action="addSelectedDayTask"
  >
    <template #title>
      <span class="eyebrow">{{ selectedDay.today ? "Today" : selectedDay.weekday }}</span>
      <time :datetime="selectedDay.iso">{{ selectedDay.dateLabel }}</time>
    </template>
    <template #list v-if="selectedDay.tasks.length !== 0">
      <JMTaskItem
        v-for="task in selectedDay.tasks" :key="task.id"
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
    </template>
  </JMCard>

  <JMCard
    class="work-backlog"
    title="Backlog"
    empty-text="No backlog tasks"
    :color="cardColors.backlog"
    :actions="[{ id: 'add', label: 'Add task', icon: 'plus', ariaLabel: 'Add backlog task' }]"
    @action="addBacklogTask"
  >
    <template #list v-if="backlogTasks.length !== 0">
      <JMTaskItem
        v-for="task in backlogTasks" :key="task.id"
        :task-id="task.id"
        :title="taskTitle(task)"
        :title-input-id="taskInputId(task)"
        :completion-input-id="taskCheckboxId(task)"
        :completed="isTaskComplete(task)"
        removable
        pin-icon="pin"
        :pin-label="`Move ${taskTitle(task) || 'untitled task'} to ${isTodaySelected ? 'today' : focusDateIso}`"
        :remove-label="`Delete ${taskTitle(task) || 'untitled task'}`"
        @enter="handleTaskTitleEnter(task, null, backlogTasks, $event)"
        @pin="toggleTaskAssignment(task)"
        @remove="removeTask(task)"
        @title-blur="handleTaskTitleBlur(task)"
        @update:completed="setTaskCompletion(task, $event)"
        @update:title="updateTaskTitle(task, $event)"
      />
    </template>
  </JMCard>
</template>
