<script>
import JMCalendar from "../components/JMCalendar/JMCalendar.vue";
import SectionTabs from "../components/SectionTabs.vue";
import { actions, state } from "../app/store.js";
import { dateKey, parseIsoDate, todayIso } from "../shared/date.js";

export default {
  name: "WorkPage",
  components: { JMCalendar, SectionTabs },
  directives: {
    focus: {
      mounted(element, binding) {
        if (binding.value) queueMicrotask(() => element.focus());
      },
      updated(element, binding) {
        if (binding.value && !binding.oldValue) queueMicrotask(() => element.focus());
      },
    },
  },
  props: {
    date: { type: String, required: true },
  },
  data() {
    return { editing: "", groups: ["today", "backlog"], state, today: todayIso() };
  },
  computed: {
    isToday() {
      return this.date === this.today;
    },
    recorded() {
      return [
        ...this.state.work.filter((item) => dateKey(item.selectedAt) === this.date),
        ...this.state.workHistory.filter((item) => dateKey(item.endedAt) === this.date),
      ];
    },
    dayType: {
      get() {
        return (
          this.state.workDays[this.date] || ([0, 6].includes(parseIsoDate(this.date).getDay()) ? "weekend" : "work")
        );
      },
      set(value) {
        actions.setWorkDay(this.date, value);
      },
    },
  },
  methods: {
    tasks(group) {
      return this.state.work.filter((item) => item.group === group);
    },
    async add(group = "today") {
      actions.addWork(group);
      await this.$nextTick();
      this.editing = this.state.work.at(-1)?.id || "";
    },
    enter(item, event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.add(item.group);
    },
    dragStart(event, item) {
      event.dataTransfer.setData("text/plain", item.id);
      event.dataTransfer.effectAllowed = "move";
    },
    drop(event, group) {
      actions.moveWork(event.dataTransfer.getData("text/plain"), group);
    },
    toggleWork(id) {
      actions.toggleWork(id);
    },
    removeEmptyWork(id) {
      actions.removeEmptyWork(id);
    },
  },
};
</script>

<template>
  <section>
    <div class="section-bar">
      <SectionTabs group="do" /><button
        v-if="isToday"
        class="mini-button section-create"
        type="button"
        @click="add('today')"
      >
        New work task ＋
      </button>
    </div>
    <JMCalendar :date="date" route-name="work" />
    <div class="work-day-status" role="group" aria-label="Type of day">
      <button
        v-for="option in ['work', 'pto', 'sick', 'holiday', 'weekend']"
        :key="option"
        type="button"
        :aria-pressed="dayType === option"
        @click="dayType = option"
      >
        {{ option === "pto" ? "PTO" : option.replace(/^./, (c) => c.toUpperCase()) }}
      </button>
    </div>
    <div v-if="isToday" class="work-lists">
      <section v-for="group in groups" :key="group" class="section-block">
        <div class="section-label">
          <h2>{{ group }}</h2>
          <span>{{ tasks(group).length }}</span>
        </div>
        <ul class="list-panel" @dragover.prevent @drop="drop($event, group)">
          <li v-for="item in tasks(group)" :key="item.id" class="simple-list-row">
            <button
              class="check-button"
              type="button"
              :aria-label="`Complete ${item.title}`"
              @click="toggleWork(item.id)"
            >
              ✓</button
            ><input
              v-focus="item.id === editing"
              v-model="item.title"
              class="inline-title"
              aria-label="Work task title"
              placeholder="New work task"
              @keydown="enter(item, $event)"
              @blur="removeEmptyWork(item.id)"
            /><button
              class="drag-handle"
              type="button"
              draggable="true"
              :aria-label="`Drag ${item.title || 'new task'}`"
              @dragstart="dragStart($event, item)"
            >
              ⠿
            </button>
          </li>
          <li v-if="!tasks(group).length" class="empty-state">Nothing here.</li>
        </ul>
      </section>
    </div>
    <section v-else class="section-block">
      <div class="section-label">
        <h2>Work on this day</h2>
        <span>{{ recorded.length }}</span>
      </div>
      <ul class="list-panel">
        <li v-for="item in recorded" :key="item.id" class="simple-list-row simple-list-row--done">
          <span class="tiny-check" aria-hidden="true">✓</span><strong>{{ item.title }}</strong>
        </li>
        <li v-if="!recorded.length" class="empty-state">Nothing recorded for this day.</li>
      </ul>
    </section>
  </section>
</template>
