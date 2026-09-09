<script>
import { flossCatalog, flossById, flossOptions } from "../../app/floss-catalog.js";
import JMProgress from "../JMProgress/JMProgress.vue";
import JMInput from "../JMInput/JMInput.vue";
import JMSelect from "../JMSelect/JMSelect.vue";

export default {
  name: "JMStitchTaskDetails",
  components: { JMInput, JMSelect, JMProgress },
  emits: ["update:crosses", "update:crosses-done", "update:floss", "update:skeins"],
  props: {
    readonly: { type: Boolean, default: false },
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
      return [...options, ...flossOptions.value];
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
  <template v-if="readonly">
    <p>
      {{ task.requiredSkeins }} {{ task.requiredSkeins === 1 ? "skein" : "skeins" }} · {{ task.crossesDone }} /
      {{ task.crosses }} crosses
    </p>
    <span v-if="isMissing && !task.completed" class="stitch-color__missing">{{ missingStatus }}</span>
    <JMProgress :value="task.crossesDone" :max="task.crosses" :label="`Crosses completed for ${task.title}`" />
  </template>
  <fieldset v-else class="stitch-color__fields" :class="{ 'stitch-color__fields--missing': isMissing }">
    <legend class="sr-only">Thread and progress for {{ task.title }}</legend>
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
    <JMProgress
      class="stitch-color__progress"
      :value="task.crossesDone"
      :max="task.crosses"
      :label="`${task.crossesDone.toLocaleString()} / ${task.crosses.toLocaleString()} crosses for ${task.title}`"
    />
  </fieldset>
</template>
