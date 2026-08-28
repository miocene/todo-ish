<script>
import JMButton from "../components/JMButton/JMButton.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import { createCompletionMoveScheduler, finishTaskDraft, moveItemToEnd, serializableTasks } from "../app/task-list.js";
import {
  calendarDate,
  canMoveWorkRange,
  getCalendarDays,
  getWorkRangeBounds,
  isIsoDate,
  isoDate,
  moveWorkRange,
  requestedDate,
} from "../app/work-calendar.js";
import { setWorkStatus, WORK_STATUSES } from "../app/work-status.js";
import { getAllWorkTasks, saveWorkTasks } from "../app/work-tasks.mock.js";

const BACKLOG_DROP_TARGET = "backlog";

export default {
  name: "WorkPage",
  components: { JMButton, JMIcon, JMTaskCard },
  data() {
    const workTasks = getAllWorkTasks().map((task) => ({ ...task }));
    const nextTaskId =
      workTasks.reduce((largestId, task) => {
        const taskId = /^new-(\d+)$/.exec(task.id);
        return taskId ? Math.max(largestId, Number(taskId[1])) : largestId;
      }, -1) + 1;
    return {
      backlogDropTarget: BACKLOG_DROP_TARGET,
      completionMoves: createCompletionMoveScheduler(),
      draftTaskIds: new Set(),
      draggedTaskId: undefined,
      dragTarget: undefined,
      midnightTimer: undefined,
      nextTaskId,
      rangeTransitionFrame: undefined,
      routeWatchReady: false,
      statusOptions: WORK_STATUSES,
      taskMoveStatus: "",
      today: calendarDate(),
      trackMoving: false,
      transitionDirection: "next",
      transitionFromDate: undefined,
      workTasks,
    };
  },
  watch: {
    "$route.query.date": {
      immediate: true,
      handler: "handleDateQueryChange",
    },
  },
  computed: {
    focusDate() {
      return requestedDate(this.$route.query.date, this.today);
    },
    rangeBounds() {
      return getWorkRangeBounds(this.today);
    },
    canGoPrevious() {
      return canMoveWorkRange(this.focusDate, -1, this.rangeBounds);
    },
    canGoNext() {
      return canMoveWorkRange(this.focusDate, 1, this.rangeBounds);
    },
    todayIso() {
      return isoDate(this.today);
    },
    days() {
      return this.getDaysWithTasks(this.focusDate);
    },
    backlogTasks() {
      return this.workTasks.filter((task) => task.date === null);
    },
    isRangeTransitioning() {
      return Boolean(this.transitionFromDate);
    },
    trackDays() {
      if (!this.transitionFromDate) return this.days;
      const outgoingDays = this.getDaysWithTasks(this.transitionFromDate);
      return this.transitionDirection === "next" ? [...outgoingDays, ...this.days] : [...this.days, ...outgoingDays];
    },
    rangeLabel() {
      return `${this.days[0].label} to ${this.days.at(-1).label}`;
    },
  },
  mounted() {
    this.rollOverIncompleteTasks();
    this.scheduleTodayRefresh();
  },
  beforeUnmount() {
    this.completionMoves.clear();
    window.cancelAnimationFrame(this.rangeTransitionFrame);
    window.clearTimeout(this.midnightTimer);
  },
  methods: {
    handleDateQueryChange(value, previousValue) {
      const date = requestedDate(value, this.today);
      if (this.routeWatchReady) {
        const previousDate = requestedDate(previousValue, this.today);
        if (isoDate(date) !== isoDate(previousDate)) this.startRangeTransition(previousDate, date);
      }
      this.routeWatchReady = true;
      this.normalizeDateQuery(value, date);
    },
    normalizeDateQuery(value, date = requestedDate(value, this.today)) {
      if (value === undefined || (isIsoDate(value) && isoDate(date) !== this.todayIso)) return;
      const query = { ...this.$route.query };
      delete query.date;
      this.$router.replace({ name: "work", query, hash: this.$route.hash });
    },
    navigateToRange(value) {
      if (this.isRangeTransitioning) return;
      const date = calendarDate(value);
      const dateIso = isoDate(date);
      const query = { ...this.$route.query };
      if (dateIso === this.todayIso) delete query.date;
      else query.date = dateIso;
      if (query.date === this.$route.query.date && !this.$route.hash) return;
      this.$router.push({ name: "work", query });
    },
    changeRange(amount) {
      if (!canMoveWorkRange(this.focusDate, amount, this.rangeBounds)) return;
      this.navigateToRange(moveWorkRange(this.focusDate, amount, this.rangeBounds));
    },
    goToday() {
      this.navigateToRange(this.today);
    },
    setDayStatus(date, value) {
      setWorkStatus(date, value);
    },
    getDaysWithTasks(focusDate) {
      return getCalendarDays(focusDate, this.todayIso).map((day) => ({
        ...day,
        tasks: this.workTasks.filter((task) => task.date === day.iso),
      }));
    },
    taskTitle(task) {
      return task.title;
    },
    taskInputId(task) {
      return `work-task-${task.id}`;
    },
    taskCheckboxId(task) {
      return `work-task-complete-${task.id}`;
    },
    isTaskComplete(task) {
      return Boolean(task.checkedAt);
    },
    canEditTask(date) {
      return date === null || date >= this.todayIso;
    },
    canDragTask(date) {
      return this.canEditTask(date);
    },
    updateTaskTitle(task, title) {
      task.title = title;
      this.saveTasks();
    },
    handleTaskTitleEnter(task, date, columnTasks, event) {
      if (event.isComposing) return;
      event.preventDefault();
      const taskIndex = columnTasks.findIndex((item) => item.id === task.id);
      const nextTask = columnTasks[taskIndex + 1] ?? this.createTask(date);
      this.focusTaskTitle(nextTask);
    },
    createTask(date) {
      const task = { id: `new-${this.nextTaskId++}`, date, title: "" };
      this.workTasks.push(task);
      this.draftTaskIds.add(task.id);
      this.saveTasks();
      return task;
    },
    addBacklogTask() {
      this.focusTaskTitle(this.createTask(null));
    },
    saveTasks() {
      saveWorkTasks(serializableTasks(this.workTasks, this.draftTaskIds));
    },
    handleTaskTitleBlur(task) {
      if (!finishTaskDraft(this.workTasks, task, this.draftTaskIds, (item) => this.taskTitle(item))) return;
      this.completionMoves.cancel(task.id);
      this.saveTasks();
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
    scheduleCompletedTaskMove(task, completed) {
      this.completionMoves.schedule(task.id, completed, () => {
        if (moveItemToEnd(this.workTasks, task)) this.saveTasks();
      });
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
    focusTaskTitle(task) {
      this.$nextTick(() => {
        const input = document.getElementById(this.taskInputId(task));
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    },
    toggleTaskAssignment(task) {
      this.moveTask(task, task.date === null ? this.todayIso : null);
    },
    moveTask(task, date) {
      if (task.date === date) return;
      task.date = date;
      this.saveTasks();
      const destination = date === null ? "backlog" : date === this.todayIso ? "today" : date;
      this.taskMoveStatus = `${this.taskTitle(task) || "Untitled task"} moved to ${destination}.`;
    },
    startTaskDrag(task, event) {
      if (!this.canDragTask(task.date)) {
        event.preventDefault();
        return;
      }
      this.draggedTaskId = task.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
    },
    canDropTask(target) {
      if (!this.draggedTaskId) return false;
      const task = this.workTasks.find((item) => item.id === this.draggedTaskId);
      if (!task || (target === BACKLOG_DROP_TARGET && task.checkedAt)) return false;
      const date = target === BACKLOG_DROP_TARGET ? null : target;
      return (date === null || date >= this.todayIso) && task.date !== date;
    },
    handleTaskDragOver(target, event) {
      if (!this.canDropTask(target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      this.dragTarget = target;
    },
    dropTask(target, event) {
      if (!this.canDropTask(target)) return;
      event.preventDefault();
      const task = this.workTasks.find((item) => item.id === this.draggedTaskId);
      if (task) this.moveTask(task, target === BACKLOG_DROP_TARGET ? null : target);
      this.endTaskDrag();
    },
    endTaskDrag() {
      this.draggedTaskId = undefined;
      this.dragTarget = undefined;
    },
    startRangeTransition(previousDate, date) {
      window.cancelAnimationFrame(this.rangeTransitionFrame);
      this.trackMoving = false;
      this.transitionDirection = date > previousDate ? "next" : "previous";

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.transitionFromDate = undefined;
        return;
      }

      this.transitionFromDate = previousDate;
      this.$nextTick(() => {
        this.rangeTransitionFrame = window.requestAnimationFrame(() => {
          this.rangeTransitionFrame = window.requestAnimationFrame(() => {
            this.trackMoving = true;
          });
        });
      });
    },
    finishRangeTransition(event) {
      if (event.target !== this.$refs.weekGrid || event.propertyName !== "transform") return;
      window.cancelAnimationFrame(this.rangeTransitionFrame);
      this.trackMoving = false;
      this.transitionFromDate = undefined;
    },
    scheduleTodayRefresh() {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      this.midnightTimer = window.setTimeout(
        () => {
          this.today = calendarDate();
          this.rollOverIncompleteTasks();
          this.normalizeDateQuery(this.$route.query.date);
          this.scheduleTodayRefresh();
        },
        nextMidnight.getTime() - now.getTime() + 100,
      );
    },
  },
};
</script>

<template>
  <section class="calendar" aria-labelledby="work-page-title">
    <div class="calendar__header">
      <h1 id="work-page-title">Work</h1>
      <p class="calendar__status" aria-live="polite" aria-atomic="true">{{ rangeLabel }}</p>

      <JMButton
        aria-label="Previous three days"
        :disabled="isRangeTransitioning || !canGoPrevious"
        icon-name="arrow-left"
        view="secondary"
        @click="changeRange(-1)"
      />
      <JMButton :disabled="isRangeTransitioning" text="Today" view="secondary" @click="goToday" />
      <JMButton
        aria-label="Next three days"
        :disabled="isRangeTransitioning || !canGoNext"
        icon-name="arrow-right"
        view="secondary"
        @click="changeRange(1)"
      />
    </div>

    <p class="calendar__status" aria-live="polite" aria-atomic="true">{{ taskMoveStatus }}</p>

    <div class="calendar-board">
      <div class="calendar-board__days">
        <div
          ref="weekGrid"
          class="week-grid"
          :class="{
            'week-grid--moving': trackMoving,
            'week-grid--next': isRangeTransitioning && transitionDirection === 'next',
            'week-grid--previous': isRangeTransitioning && transitionDirection === 'previous',
          }"
          role="group"
          :aria-label="rangeLabel"
          :aria-busy="isRangeTransitioning"
          @transitioncancel="finishRangeTransition"
          @transitionend="finishRangeTransition"
        >
          <div
            v-for="day in trackDays"
            :key="day.iso"
            class="week-day"
            :class="{
              'week-day--today': day.today,
              'week-day--drop-target': dragTarget === day.iso,
            }"
            @dragover="handleTaskDragOver(day.iso, $event)"
            @drop="dropTask(day.iso, $event)"
          >
            <time class="week-day__heading" :datetime="day.iso">
              <span class="week-day__weekday">{{ day.weekday }}</span>
              <span class="week-day__date">
                <strong>{{ day.day }}</strong>
                <small>{{ day.month }}</small>
              </span>
            </time>
            <label class="calendar__status-select">
              <select
                :value="day.statusValue"
                :aria-label="`Status for ${day.label}`"
                @change="setDayStatus(day.iso, $event.target.value)"
              >
                <component :is="'button'" type="button">
                  <component :is="'selectedcontent'" />
                  <JMIcon name="chevron-down" />
                </component>
                <option v-for="status in statusOptions" :key="status.value" :value="status.value">
                  <JMIcon :name="status.icon" />
                  {{ status.label }}
                  <JMIcon v-if="status.value === day.statusValue" class="calendar__status-check" name="check" />
                </option>
              </select>
            </label>
            <JMIcon v-if="!day.tasks" name="spinner" label="Loading tasks" />
            <JMTaskCard
              v-else
              v-for="task in day.tasks"
              :key="task.id"
              :task-id="task.id"
              :title="taskTitle(task)"
              :title-input-id="taskInputId(task)"
              :completion-input-id="taskCheckboxId(task)"
              :completed="isTaskComplete(task)"
              :editable="canEditTask(day.iso)"
              :can-drag="canDragTask(day.iso)"
              reserve-drag-space
              :pin-icon="isTaskComplete(task) ? '' : 'pinned'"
              :pin-label="`Move ${taskTitle(task) || 'untitled task'} to backlog`"
              @drag-end="endTaskDrag"
              @drag-start="startTaskDrag(task, $event)"
              @enter="handleTaskTitleEnter(task, day.iso, day.tasks, $event)"
              @pin="toggleTaskAssignment(task)"
              @title-blur="handleTaskTitleBlur(task)"
              @update:completed="setTaskCompletion(task, $event)"
              @update:title="updateTaskTitle(task, $event)"
            />
          </div>
        </div>
      </div>

      <section
        class="backlog"
        :class="{ 'backlog--drop-target': dragTarget === backlogDropTarget }"
        aria-labelledby="backlog-title"
        @dragover="handleTaskDragOver(backlogDropTarget, $event)"
        @drop="dropTask(backlogDropTarget, $event)"
      >
        <header class="backlog__heading">
          <span class="week-day__weekday">Tasks</span>
          <h2 id="backlog-title">Backlog</h2>
          <JMButton
            class="backlog__add"
            aria-label="Add backlog task"
            text="Add task"
            view="secondary"
            @click="addBacklogTask"
          />
        </header>
        <p v-if="backlogTasks.length === 0" class="backlog__empty">No backlog tasks</p>
        <JMTaskCard
          v-for="task in backlogTasks"
          :key="task.id"
          :task-id="task.id"
          :title="taskTitle(task)"
          :title-input-id="taskInputId(task)"
          :completion-input-id="taskCheckboxId(task)"
          :completed="isTaskComplete(task)"
          can-drag
          pin-icon="pin"
          :pin-label="`Mark ${taskTitle(task) || 'untitled task'} ready for today`"
          @drag-end="endTaskDrag"
          @drag-start="startTaskDrag(task, $event)"
          @enter="handleTaskTitleEnter(task, null, backlogTasks, $event)"
          @pin="toggleTaskAssignment(task)"
          @title-blur="handleTaskTitleBlur(task)"
          @update:completed="setTaskCompletion(task, $event)"
          @update:title="updateTaskTitle(task, $event)"
        />
      </section>
    </div>
  </section>
</template>
