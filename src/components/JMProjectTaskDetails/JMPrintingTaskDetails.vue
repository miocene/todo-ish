<script>
import { filamentCatalog, filamentLabel, filaments, filamentsById } from "../../app/filament-catalog.js";
import JMButton from "../JMButton/JMButton.vue";
import JMIcon from "../JMIcon/JMIcon.vue";
import JMInput from "../JMInput/JMInput.vue";

export default {
  name: "JMPrintingTaskDetails",
  components: { JMButton, JMIcon, JMInput },
  emits: ["add", "remove", "update:filament", "update:weight"],
  props: {
    supplyById: { type: Map, required: true },
    task: { type: Object, required: true },
  },
  data() {
    return { filaments, filamentCatalog, filamentsById };
  },
  methods: {
    filamentInputId(usage) {
      return `printing-filament-${this.task.id}-${usage.id}`;
    },
    filamentStatusId(usage) {
      return `printing-filament-status-${this.task.id}-${usage.id}`;
    },
    weightInputId(usage) {
      return `printing-weight-${this.task.id}-${usage.id}`;
    },
    isMissing(usage) {
      return Boolean(
        usage.catalogId &&
        ((filamentCatalog.state.status === "ready" && !filamentsById.has(usage.catalogId)) ||
          (this.supplyById.get(usage.catalogId)?.missingSpools ?? 0) > 0),
      );
    },
    missingStatus(usage) {
      const supply = this.supplyById.get(usage.catalogId);
      if (filamentCatalog.state.status === "ready" && !filamentsById.has(usage.catalogId)) {
        return `Not in catalog · Need ${supply?.requiredSpools ?? 1} ${supply?.requiredSpools === 1 ? "spool" : "spools"}`;
      }
      return `Missing ${supply.missingSpools} ${supply.missingSpools === 1 ? "spool" : "spools"} · ${supply.ownedSpools} owned`;
    },
    filamentLabel,
  },
};
</script>

<template>
  <fieldset class="printing-item__fields">
    <legend class="task-page__visually-hidden">Filaments and weights for {{ task.title || "untitled item" }}</legend>
    <div
      v-for="(usage, usageIndex) in task.filaments"
      :key="usage.id"
      class="printing-filament"
      :class="{ 'printing-filament--missing': isMissing(usage) }"
    >
      <div class="printing-item__field printing-item__field--filament">
        <label :for="filamentInputId(usage)">Filament {{ usageIndex + 1 }}</label>
        <select
          :id="filamentInputId(usage)"
          name="item-filament"
          :disabled="filamentCatalog.state.status !== 'ready'"
          :value="usage.catalogId"
          :aria-describedby="isMissing(usage) ? filamentStatusId(usage) : undefined"
          @change="$emit('update:filament', usage, $event.target.value)"
        >
          <option value="">Choose filament</option>
          <option v-if="usage.catalogId && !filamentsById.has(usage.catalogId)" :value="usage.catalogId">
            {{ usage.label || usage.catalogId }}
          </option>
          <option v-for="filament in filaments" :key="filament.id" :value="filament.id">
            {{ filamentLabel(filament) }}
          </option>
        </select>
        <span v-if="isMissing(usage)" :id="filamentStatusId(usage)" class="printing-item__missing">
          {{ missingStatus(usage) }}
        </span>
      </div>
      <div class="printing-item__field printing-item__field--weight">
        <label :for="weightInputId(usage)">Weight {{ usageIndex + 1 }}</label>
        <div class="printing-item__weight-control">
          <JMInput
            :id="weightInputId(usage)"
            name="item-weight"
            type="number"
            size="s"
            inputmode="decimal"
            min="0"
            step="0.1"
            :model-value="usage.weightGrams"
            @update:model-value="$emit('update:weight', usage, $event)"
          />
          <span aria-hidden="true">g</span>
        </div>
      </div>
      <button
        class="printing-filament__remove"
        type="button"
        :aria-label="`Remove filament ${usageIndex + 1} from ${task.title || 'untitled item'}`"
        @click="$emit('remove', usage)"
      >
        <JMIcon name="remove" />
      </button>
    </div>
    <JMButton text="Add filament" view="ghost" @click="$emit('add')" />
  </fieldset>
</template>
