<script>
import { WORK_STATUSES } from "../../app/work-status.js";
import JMIcon from "../JMIcon/JMIcon.vue";
import JMSelect from "../JMSelect/JMSelect.vue";

const DISPLAY_ORDER = ["conference", "work", "sick-leave", "pto", "business-trip", "holiday", "weekend"];

export default {
  name: "JMCalendarDay",
  components: { JMIcon, JMSelect },
  props: {
    day: { type: Object, required: true },
    selected: Boolean,
  },
  emits: ["activate", "update:day-type"],
  computed: {
    editable() {
      return this.selected;
    },
    dayClasses() {
      return {
        "day": true,
        "selected": this.selected,
        "today": this.day.today,
      };
    },
    activityDescription() {
      const count = this.day.activityCount;
      if (count === 0) return "No completed tasks";
      return `${count} completed ${count === 1 ? "task" : "tasks"}`;
    },
    dateLabel() {
      return `${this.day.label}. ${this.activityDescription}`;
    },
    options() {
      return DISPLAY_ORDER.map((value) => {
        const status = WORK_STATUSES.find((status) => status.value === value);
        return { value, text: status.label, iconName: status.icon };
      });
    },
    selectedOption() {
      return WORK_STATUSES.find((status) => status.value === this.day.dayType);
    },
    inputId() {
      return `calendar-day-type-${this.day.value}`;
    },
  },
};
</script>

<template>
  <button
    v-if="!editable"
    :class="dayClasses"
    type="button"
    :aria-current="selected ? 'date' : undefined"
    :aria-label="dateLabel"
    :disabled="day.disabled"
    @click="$emit('activate', day.value)"
  >
    <small class="weekday">{{ day.day }}</small>
    <strong class="date">{{ day.number }}</strong>
    <span class="icon" :data-level="day.activityLevel" aria-hidden="true">
      <JMIcon :name="selectedOption.icon" />
    </span>
  </button>
  <label
    v-else
    :class="dayClasses"
    :for="inputId"
    :aria-current="selected ? 'date' : undefined"
    :aria-label="dateLabel"
  >
    <small class="weekday" aria-hidden="true">{{ day.day }}</small>
    <strong class="date" aria-hidden="true">{{ day.number }}</strong>
    <JMSelect
      :id="inputId"
      class="icon"
      :name="inputId"
      view="ghost"
      size="xs"
      icon-only
      :data-level="day.activityLevel"
      :aria-label="`Change day type for ${day.label}. Current type: ${selectedOption.label}. ${activityDescription}`"
      :model-value="day.dayType"
      :options="options"
      @update:model-value="$emit('update:day-type', { date: day.value, value: $event })"
    />
  </label>
</template>
