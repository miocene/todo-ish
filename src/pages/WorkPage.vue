<script>
import { createTaskEditor } from "../app/task-editor.js";
import { appClock } from "../app/clock.js";
import { activityLevel } from "../app/activity.js";
import { loadCardColors } from "../app/card-colors.js";
import { setTaskCompletion as completeTask, serializableTasks } from "../app/task-list.js";
import { calendarDate, getCalendarDay, getWorkDateBounds, isoDate, requestedDate } from "../app/work-calendar.js";
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
      cardColors: {},
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
      this.normalizeDateQuery();
    },
    focusDateIso: {
      immediate: true,
      handler(date) {
        this.cardColors = loadCardColors(["backlog", `work-day:${date}`]);
        this.normalizeDateQuery();
      },
    },
    "$route.query.date": {
      immediate: true,
      handler: "normalizeDateQuery",
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
      return requestedDate(this.$route.query.date, this.today, this.dateBounds);
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
      return date === null || (date >= isoDate(this.dateBounds.firstAssignableDate) && date <= this.lastAvailableDate);
    },
    createTask(date) {
      if (!this.canEditTask(date)) return;
      const task = { id: `new-${this.nextTaskId++}`, date, title: "", completed: false };
      if (date !== null && date < this.todayIso) completeTask(task, true);
      return this.editor.add(this.workTasks, task);
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
    handleTaskTitleBlur(task) {
      this.editor.finish(this.workTasks, task);
    },
    handleTaskTitleEnter(task, date, dayTasks, event) {
      this.editor.enter(dayTasks, task, event, {
        create: () => this.focusTaskTitle(this.createTask(date)),
        focus: this.focusTaskTitle,
      });
    },
    moveTask(task, date) {
      if (task.date === date || !this.canEditTask(date)) return;
      this.editor.moves.cancel(task.id);
      task.date = date;
      completeTask(task, date !== null && date < this.todayIso);
      this.saveTasks();
      const destination = date === null ? "backlog" : date === this.todayIso ? "today" : date;
      this.taskMoveStatus = `${task.title || "Untitled task"} moved to ${destination}${task.completed ? " and marked completed" : ""}.`;
      this.focusTask(task);
    },
    normalizeDateQuery() {
      const value = this.$route.query.date;
      const date = this.focusDateIso;
      const normalized = date === this.todayIso ? undefined : date;
      if (value === normalized) return;
      const query = { ...this.$route.query };
      if (normalized) query.date = normalized;
      else delete query.date;
      return this.$router.replace({ name: "work", query, hash: this.$route.hash });
    },
    focusTask(task) {
      this.$nextTick(() => {
        const input = document.getElementById(this.taskInputId(task));
        const checkbox = document.getElementById(this.taskCheckboxId(task));
        (input || checkbox)?.focus();
      });
    },
    focusAfterRemoval(tasks, index, date) {
      const next = tasks[index + 1] || tasks[index - 1];
      if (next) this.focusTask(next);
      else
        this.$nextTick(async () => {
          await this.normalizeDateQuery();
          await this.$nextTick();
          const card = date === null ? this.$refs.backlogCard : this.$refs.dayCard;
          const button = card?.$el.querySelector(".header button");
          (button || this.$refs.calendar.$el.querySelector("select"))?.focus();
        });
    },
    rollOverIncompleteTasks() {
      let taskMoved = false;
      for (const task of this.workTasks) {
        if (!task.completed && task.date !== null && task.date < this.todayIso) {
          task.date = this.todayIso;
          taskMoved = true;
        }
      }
      if (taskMoved) this.saveTasks();
    },
    removeTask(task) {
      const taskIndex = this.workTasks.indexOf(task);
      if (taskIndex === -1) return;
      const list = task.date === null ? this.backlogTasks : this.selectedDay.tasks;
      const listIndex = list.indexOf(task);
      this.editor.moves.cancel(task.id);
      this.editor.drafts.delete(task.id);
      this.workTasks.splice(taskIndex, 1);
      this.saveTasks();
      this.taskMoveStatus = `${task.title || "Untitled task"} deleted.`;
      this.focusAfterRemoval(list, listIndex, task.date);
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
      const previousDate = task.date;
      const previousTasks = previousDate === null ? this.backlogTasks : this.selectedDay.tasks;
      const index = previousTasks.indexOf(task);
      completeTask(task, completed);
      if (completed && task.date === null) {
        task.date = this.todayIso;
      } else if (!completed && task.date !== null && task.date < this.todayIso) {
        task.date = this.todayIso;
      }
      this.saveTasks();
      this.scheduleCompletedTaskMove(task, completed);
      if (previousDate !== task.date) {
        this.taskMoveStatus = `${task.title || "Untitled task"} moved to today.`;
        if (this.isTodaySelected) this.focusTask(task);
        else this.focusAfterRemoval(previousTasks, index, previousDate);
      }
    },
    taskCheckboxId(task) {
      return `work-task-complete-${task.id}`;
    },
    taskInputId(task) {
      return `work-task-${task.id}`;
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
    @range-change="calendarRangeDate = $event"
    @update:day-type="setDayStatus"
  />

  <p class="work-page__status sr-only" aria-live="polite" aria-atomic="true">{{ taskMoveStatus }}</p>

  <JMCard
    ref="dayCard"
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
        v-for="task in selectedDay.tasks"
        :key="task.id"
        :task-id="task.id"
        :title="task.title"
        :title-input-id="taskInputId(task)"
        :completion-input-id="taskCheckboxId(task)"
        :completed="task.completed"
        :editable="canEditTask(selectedDay.iso)"
        removable
        :pin-icon="task.completed ? '' : 'pinned'"
        :pin-label="`Move ${task.title || 'untitled task'} to backlog`"
        :remove-label="`Delete ${task.title || 'untitled task'}`"
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
    ref="backlogCard"
    class="work-backlog"
    title="Backlog"
    empty-text="No backlog tasks"
    :color="cardColors.backlog"
    :actions="[{ id: 'add', label: 'Add task', icon: 'plus', ariaLabel: 'Add backlog task' }]"
    @action="addBacklogTask"
  >
    <template #list v-if="backlogTasks.length !== 0">
      <JMTaskItem
        v-for="task in backlogTasks"
        :key="task.id"
        :task-id="task.id"
        :title="task.title"
        :title-input-id="taskInputId(task)"
        :completion-input-id="taskCheckboxId(task)"
        :completed="task.completed"
        removable
        :pin-icon="canEditSelectedDay ? 'pin' : ''"
        :pin-label="`Move ${task.title || 'untitled task'} to ${isTodaySelected ? 'today' : focusDateIso}`"
        :remove-label="`Delete ${task.title || 'untitled task'}`"
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
