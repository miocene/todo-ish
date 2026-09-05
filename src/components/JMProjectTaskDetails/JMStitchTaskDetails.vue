<script>
import { flossCatalog, flossById, floss, flossLabel } from "../../app/floss-catalog.js";
import JMInput from "../JMInput/JMInput.vue";

export default {
  name: "JMStitchTaskDetails",
  components: { JMInput },
  emits: ["update:crosses", "update:crosses-done", "update:floss", "update:skeins"],
  props: {
    supplyById: { type: Map, required: true },
    task: { type: Object, required: true },
  },
  data() {
    return { floss, flossCatalog, flossById };
  },
  computed: {
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
    flossLabel,
  },
};
</script>

<template>
  <fieldset class="stitch-color__fields" :class="{ 'stitch-color__fields--missing': isMissing }">
    <legend class="task-page__visually-hidden">Thread and progress for {{ task.title }}</legend>
    <div class="stitch-color__field stitch-color__field--thread">
      <label :for="inputId('floss')">Thread color</label>
      <select
        :id="inputId('floss')"
        name="stitch-floss"
        :disabled="flossCatalog.state.status !== 'ready'"
        :value="task.flossId"
        :aria-describedby="isMissing ? inputId('status') : undefined"
        @change="$emit('update:floss', $event.target.value)"
      >
        <option value="">Choose DMC color</option>
        <option v-if="task.flossId && !flossById.has(task.flossId)" :value="task.flossId">
          {{ task.title || task.flossId }}
        </option>
        <option v-for="thread in floss" :key="thread.id" :value="thread.id">{{ flossLabel(thread) }}</option>
      </select>
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
