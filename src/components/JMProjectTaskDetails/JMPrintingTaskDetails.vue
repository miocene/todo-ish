<script>
import JMSwatch from "../JMSwatch/JMSwatch.vue";
import {
  filamentCatalog,
  filamentOptions,
  filamentsById,
} from "../../app/filament-catalog.js";
import JMButton from "../JMButton/JMButton.vue";
import JMInput from "../JMInput/JMInput.vue";
import JMSelect from "../JMSelect/JMSelect.vue";

export default {
  name: "JMPrintingTaskDetails",
  components: { JMSwatch, JMButton, JMInput, JMSelect },
  emits: ["remove", "update:filament", "update:weight"],
  props: {
    readonly: { type: Boolean, default: false },
    supplyById: { type: Map, required: true },
    task: { type: Object, required: true },
  },
  data() {
    return { filamentCatalog };
  },
  computed: {
    catalogOptions() {
      return filamentOptions.value;
    },
  },
  methods: {
    filamentPreview(usage) {
      return filamentsById.get(usage.catalogId);
    },
    filamentOptions(usage) {
      const options = [{ value: "", text: "Choose filament" }];
      if (usage.catalogId && !filamentsById.has(usage.catalogId)) {
        options.push({
          value: usage.catalogId,
          text: usage.label || usage.catalogId,
        });
      }
      return [...options, ...this.catalogOptions];
    },
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
        ((filamentCatalog.state.status === "ready" &&
          !filamentsById.has(usage.catalogId)) ||
          (this.supplyById.get(usage.catalogId)?.missingSpools ?? 0) > 0),
      );
    },
    missingStatus(usage) {
      const supply = this.supplyById.get(usage.catalogId);
      if (
        filamentCatalog.state.status === "ready" &&
        !filamentsById.has(usage.catalogId)
      ) {
        return `Not in catalog · Need ${supply?.requiredSpools ?? 1} ${supply?.requiredSpools === 1 ? "spool" : "spools"}`;
      }
      return `Missing ${supply.missingSpools} ${supply.missingSpools === 1 ? "spool" : "spools"} · ${supply.ownedSpools} owned`;
    },
  },
};
</script>

<template>
  <div
    v-for="(usage, usageIndex) in task.filaments"
    :key="usage.id"
    class="filament"
  >
    <div class="printing-item__field printing-item__field--filament">
      <span v-if="readonly">
        <JMSwatch
          v-if="filamentPreview(usage)?.swatch"
          :value="filamentPreview(usage).swatch"
        />
        {{ usage.label || usage.catalogId || "No filament selected" }}
      </span>
      <JMSelect
        v-else
        :aria-label="`Filament ${usageIndex + 1}`"
        :id="filamentInputId(usage)"
        name="item-filament"
        size="s"
        :disabled="filamentCatalog.state.status !== 'ready'"
        :model-value="usage.catalogId"
        :options="filamentOptions(usage)"
        :aria-describedby="
          isMissing(usage) ? filamentStatusId(usage) : undefined
        "
        @update:model-value="$emit('update:filament', usage, $event)"
      />
      <span
        v-if="isMissing(usage) && !task.completed"
        :id="filamentStatusId(usage)"
        class="missing"
      >
        {{ missingStatus(usage) }}
      </span>
    </div>
    <span v-if="readonly">{{ usage.weightGrams || 0 }} g</span>
    <JMInput
      v-else
      :aria-label="`Weight ${usageIndex + 1} (g)`"
      class="printing-item__field--weight"
      :id="weightInputId(usage)"
      name="item-weight"
      type="number"
      size="s"
      inputmode="decimal"
      min="0"
      step="10"
      :model-value="usage.weightGrams"
      @update:model-value="$emit('update:weight', usage, $event)"
    />
    <JMButton
      v-if="!readonly"
      class="printing-filament__remove"
      icon-name="remove"
      view="ghost"
      size="s"
      :aria-label="`Remove filament ${usageIndex + 1} from ${task.title || 'untitled item'}`"
      @click="$emit('remove', usage)"
    />
  </div>
</template>
