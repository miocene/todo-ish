<script>
import { useId } from "vue";
import JMInput from "../JMInput/JMInput.vue";
import JMSelect from "../JMSelect/JMSelect.vue";
import { WEEKDAYS } from "../../app/chore-schedule.js";
import "./jm-chore-schedule.css";

const FREQUENCIES = ["day", "week", "month"].map((value) => ({ value, text: value[0].toUpperCase() + value.slice(1) }));
export default {
  name: "JMChoreSchedule",
  components: { JMInput, JMSelect },
  props: { modelValue: { type: Object, required: true }, title: { type: String, default: "" } },
  emits: ["update:modelValue", "update:valid"],
  setup() {
    return { id: useId() };
  },
  data() {
    return { frequencies: FREQUENCIES, weekdays: WEEKDAYS, intervalInput: this.modelValue.interval };
  },
  computed: {
    intervalValid() {
      const interval = Number(this.intervalInput);
      return Number.isInteger(interval) && interval >= 1 && interval <= 999;
    },
  },
  watch: {
    intervalValid: {
      immediate: true,
      handler(valid) {
        this.$emit("update:valid", valid);
      },
    },
    "modelValue.interval"(value) {
      this.intervalInput = value;
    },
  },
  methods: {
    update(value) {
      this.$emit("update:modelValue", { ...this.modelValue, ...value });
    },
    updateInterval(value) {
      this.intervalInput = value;
      const interval = Number(value);
      if (Number.isInteger(interval) && interval >= 1 && interval <= 999) this.update({ interval });
    },
    toggle(field, value) {
      const selected = this.modelValue[field];
      if (selected.includes(value) && selected.length === 1) return;
      this.update({
        [field]: selected.includes(value)
          ? selected.filter((day) => day !== value)
          : [...selected, value].sort((a, b) => a - b),
      });
    },
  },
};
</script>

<template>
  <fieldset class="jm-chore-schedule">
    <legend class="sr-only">Schedule for {{ title || "untitled chore" }}</legend>
    <div class="jm-chore-schedule__interval">
      <JMInput
        label="Every"
        type="number"
        size="s"
        min="1"
        max="999"
        step="1"
        :model-value="intervalInput"
        @update:model-value="updateInterval"
      />
      <label :for="`chore-frequency-${id}`">
        <span>Frequency</span>
        <JMSelect
          :id="`chore-frequency-${id}`"
          size="s"
          :options="frequencies"
          :model-value="modelValue.frequency"
          @update:model-value="update({ frequency: $event })"
        />
      </label>
    </div>
    <p v-if="!intervalValid" role="alert">Enter a whole interval between 1 and 999.</p>
    <fieldset v-if="modelValue.frequency === 'week'" class="jm-chore-schedule__days">
      <legend>On weekdays</legend>
      <label v-for="(day, index) in weekdays" :key="day" class="jm-chore-schedule__day">
        <input
          type="checkbox"
          :aria-label="day"
          :checked="modelValue.weekdays.includes(index)"
          :disabled="modelValue.weekdays.length === 1 && modelValue.weekdays.includes(index)"
          @change="toggle('weekdays', index)"
        />
        <span aria-hidden="true">{{ day[0] }}</span>
      </label>
    </fieldset>
    <fieldset v-if="modelValue.frequency === 'month'" class="jm-chore-schedule__days">
      <legend>On days of the month</legend>
      <label v-for="day in 31" :key="day" class="jm-chore-schedule__day">
        <input
          type="checkbox"
          :aria-label="`Day ${day}`"
          :checked="modelValue.monthDays.includes(day)"
          :disabled="modelValue.monthDays.length === 1 && modelValue.monthDays.includes(day)"
          @change="toggle('monthDays', day)"
        />
        <span aria-hidden="true">{{ day }}</span>
      </label>
      <small class="jm-chore-schedule__hint">Shorter months use their last day.</small>
    </fieldset>
  </fieldset>
</template>
