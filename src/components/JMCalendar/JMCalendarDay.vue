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
    showDayType: Boolean,
  },
  emits: ["activate", "update:day-type"],
  computed: {
    editable() {
      return this.selected && this.showDayType;
    },
    dayClasses() {
      return {
        "jm-calendar__day": true,
        "jm-calendar__day--selected": this.selected,
        "jm-calendar__day--today": this.day.today,
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
    class="jm-day-type jm-day-type--static"
    :class="dayClasses"
    type="button"
    :aria-current="selected ? 'date' : undefined"
    :aria-label="dateLabel"
    :disabled="day.disabled"
    @click="$emit('activate', day.value)"
  >
    <span class="jm-day-type__icon" :data-level="day.activityLevel" aria-hidden="true">
      <JMIcon :name="selectedOption.icon" />
    </span>
    <strong class="jm-calendar__date">{{ day.number }}</strong>
    <small class="jm-calendar__weekday">{{ day.day }}</small>
  </button>
  <label
    v-else
    class="jm-day-type jm-day-type--editable"
    :class="dayClasses"
    :for="inputId"
    :aria-current="selected ? 'date' : undefined"
    :aria-label="dateLabel"
  >
    <JMSelect
      :id="inputId"
      class="jm-day-type__icon"
      :name="inputId"
      view="ghost"
      icon-only
      :data-level="day.activityLevel"
      :aria-label="`Change day type for ${day.label}. Current type: ${selectedOption.label}. ${activityDescription}`"
      :model-value="day.dayType"
      :options="options"
      @update:model-value="$emit('update:day-type', { date: day.value, value: $event })"
    />
    <strong class="jm-calendar__date" aria-hidden="true">{{ day.number }}</strong>
    <small class="jm-calendar__weekday" aria-hidden="true">{{ day.day }}</small>
  </label>
</template>
