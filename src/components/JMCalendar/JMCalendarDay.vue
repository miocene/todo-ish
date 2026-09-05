<script>
import { WORK_STATUSES } from "../../app/work-status.js";
import JMIcon from "../JMIcon/JMIcon.vue";

const DISPLAY_ORDER = ["conference", "work", "sick-leave", "pto", "business-trip", "holiday", "weekend"];

export default {
  name: "JMCalendarDay",
  components: { JMIcon },
  data() {
    return { open: false };
  },
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
      return DISPLAY_ORDER.map((value) => WORK_STATUSES.find((status) => status.value === value));
    },
    selectedOption() {
      return WORK_STATUSES.find((status) => status.value === this.day.dayType);
    },
  },
  mounted() {
    document.addEventListener("pointerdown", this.closeFromOutside);
  },
  beforeUnmount() {
    document.removeEventListener("pointerdown", this.closeFromOutside);
  },
  methods: {
    close(returnFocus = false) {
      if (!this.$refs.details?.open) return;
      this.$refs.details.open = false;
      if (returnFocus) this.$refs.trigger.focus();
    },
    closeFromOutside(event) {
      if (!this.$refs.details?.contains(event.target)) this.close();
    },
    selectOption(value) {
      this.$emit("update:day-type", { date: this.day.value, value });
      this.close(true);
    },
    toggle() {
      this.$refs.details.open = !this.$refs.details.open;
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
  <details
    v-else
    ref="details"
    class="jm-day-type"
    :class="dayClasses"
    :aria-current="selected ? 'date' : undefined"
    :aria-label="dateLabel"
    @keydown.esc.prevent.stop="close(true)"
    @toggle="open = $event.target.open"
  >
    <summary
      ref="trigger"
      class="jm-day-type__trigger"
      role="button"
      :aria-expanded="open"
      :aria-label="`Change day type for ${day.label}. Current type: ${selectedOption.label}. ${activityDescription}`"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent
      @keyup.space.prevent="toggle"
    >
      <span class="jm-day-type__icon" :data-level="day.activityLevel" aria-hidden="true">
        <JMIcon :name="selectedOption.icon" />
      </span>
      <strong class="jm-calendar__date" aria-hidden="true">{{ day.number }}</strong>
      <small class="jm-calendar__weekday" aria-hidden="true">{{ day.day }}</small>
    </summary>

    <fieldset class="jm-day-type__menu">
      <legend class="jm-day-type__visually-hidden">Day type for {{ day.label }}</legend>
      <label v-for="option in options" :key="option.value" class="jm-day-type__option">
        <input
          class="jm-day-type__input"
          type="radio"
          :name="`calendar-day-type-${day.value}`"
          :value="option.value"
          :checked="option.value === day.dayType"
          @change="selectOption(option.value)"
        />
        <span class="jm-day-type__option-content">
          <JMIcon :name="option.icon" />
          <span class="jm-day-type__option-label">{{ option.label }}</span>
          <JMIcon v-if="option.value === day.dayType" class="jm-day-type__check" name="check" />
        </span>
      </label>
    </fieldset>
  </details>
</template>
