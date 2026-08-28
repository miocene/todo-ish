<script>
import { floss, flossLabel } from "../../app/floss-catalog.js";

export default {
  name: "JMStitchTaskDetails",
  emits: ["update:crosses", "update:crosses-done", "update:floss", "update:skeins"],
  props: {
    supplyById: { type: Map, required: true },
    task: { type: Object, required: true },
  },
  data() {
    return { floss };
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
        :value="task.flossId"
        :aria-describedby="isMissing ? inputId('status') : undefined"
        @change="$emit('update:floss', $event.target.value)"
      >
        <option value="">Choose DMC color</option>
        <option v-for="thread in floss" :key="thread.id" :value="thread.id">{{ flossLabel(thread) }}</option>
      </select>
      <span v-if="isMissing" :id="inputId('status')" class="stitch-color__missing">{{ missingStatus }}</span>
    </div>
    <div class="stitch-color__field">
      <label :for="inputId('skeins')">Skeins needed</label>
      <input
        :id="inputId('skeins')"
        name="stitch-skeins"
        type="number"
        inputmode="numeric"
        min="0"
        step="1"
        :value="task.requiredSkeins"
        @input="$emit('update:skeins', $event.target.value)"
      />
    </div>
    <div class="stitch-color__field">
      <label :for="inputId('crosses-done')">Crosses done</label>
      <input
        :id="inputId('crosses-done')"
        name="stitch-crosses-done"
        type="number"
        inputmode="numeric"
        min="0"
        :max="task.crosses"
        step="1"
        :value="task.crossesDone"
        @input="$emit('update:crosses-done', $event.target.value)"
      />
    </div>
    <div class="stitch-color__field">
      <label :for="inputId('crosses')">Crosses total</label>
      <input
        :id="inputId('crosses')"
        name="stitch-crosses-total"
        type="number"
        inputmode="numeric"
        min="0"
        step="1"
        :value="task.crosses"
        @input="$emit('update:crosses', $event.target.value)"
      />
    </div>
    <p class="stitch-color__progress">
      {{ task.crossesDone.toLocaleString() }} / {{ task.crosses.toLocaleString() }} crosses<span v-if="task.completed">
        · Done</span
      >
    </p>
  </fieldset>
</template>
