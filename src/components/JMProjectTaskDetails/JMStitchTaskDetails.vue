<script>
import { flossCatalog, flossById, floss, flossLabel } from "../../app/floss-catalog.js";
import JMInput from "../JMInput/JMInput.vue";
import JMSelect from "../JMSelect/JMSelect.vue";

export default {
  name: "JMStitchTaskDetails",
  components: { JMInput, JMSelect },
  emits: ["update:crosses", "update:crosses-done", "update:floss", "update:skeins"],
  props: {
    supplyById: { type: Map, required: true },
    task: { type: Object, required: true },
  },
  data() {
    return { flossCatalog };
  },
  computed: {
    flossOptions() {
      const options = [{ value: "", text: "Choose DMC color" }];
      if (this.task.flossId && !flossById.has(this.task.flossId)) {
        options.push({ value: this.task.flossId, text: this.task.title || this.task.flossId });
      }
      return [...options, ...floss.map((thread) => ({ value: thread.id, text: flossLabel(thread) }))];
    },
    shortage() {
      return this.supplyById.get(this.task.flossId);
    },
    isMissing() {
      return Boolean(this.task.flossId && (this.shortage?.missingSkeins ?? 0) > 0);
    },
    missingStatus() {
      if (!this.shortage) return "";
      return `Missing ${this.shortage.missingSkeins} ${this.shortage.missingSkeins === 1 ? "skein" : "skeins"} · ${this.shortage.ownedSkeins} owned`;
    },
  },
  methods: {
    inputId(field) {
      return `stitch-${field}-${this.task.id}`;
    },
  },
};
</script>

<template>
  <fieldset class="stitch-color__fields" :class="{ 'stitch-color__fields--missing': isMissing }">
    <legend class="task-page__visually-hidden">Thread and progress for {{ task.title }}</legend>
    <div class="stitch-color__field stitch-color__field--thread">
      <label :for="inputId('floss')">Thread color</label>
      <JMSelect
        :id="inputId('floss')"
        name="stitch-floss"
        size="s"
        :disabled="flossCatalog.state.status !== 'ready'"
        :model-value="task.flossId"
        :options="flossOptions"
        :aria-describedby="isMissing ? inputId('status') : undefined"
        @update:model-value="$emit('update:floss', $event)"
      />
      <span v-if="isMissing" :id="inputId('status')" class="stitch-color__missing">{{ missingStatus }}</span>
    </div>
    <JMInput
      :id="inputId('skeins')"
      label="Skeins needed"
      name="stitch-skeins"
      type="number"
      size="s"
      inputmode="numeric"
      min="0"
      step="1"
      :model-value="task.requiredSkeins"
      @update:model-value="$emit('update:skeins', $event)"
    />
    <JMInput
      :id="inputId('crosses-done')"
      label="Crosses done"
      name="stitch-crosses-done"
      type="number"
      size="s"
      inputmode="numeric"
      min="0"
      :max="task.crosses"
      step="1"
      :model-value="task.crossesDone"
      @update:model-value="$emit('update:crosses-done', $event)"
    />
    <JMInput
      :id="inputId('crosses')"
      label="Crosses total"
      name="stitch-crosses-total"
      type="number"
      size="s"
      inputmode="numeric"
      min="0"
      step="1"
      :model-value="task.crosses"
      @update:model-value="$emit('update:crosses', $event)"
    />
    <p class="stitch-color__progress">
      {{ task.crossesDone.toLocaleString() }} / {{ task.crosses.toLocaleString() }} crosses<span v-if="task.completed">
        · Done</span
      >
    </p>
  </fieldset>
</template>
