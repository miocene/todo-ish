<script>
import { RouterLink } from "vue-router";
import { projectProgress } from "../domain/printing.js";

export default {
  name: "PrintProjectCard",
  components: { RouterLink },
  props: {
    project: { type: Object, required: true },
    compact: Boolean,
  },
  emits: ["toggle"],
  computed: {
    progress() {
      return projectProgress(this.project);
    },
    visibleParts() {
      return [...this.project.parts].sort((a, b) => Number(a.status === "Done") - Number(b.status === "Done"));
    },
  },
};
</script>

<template>
  <article class="home-project-card make-project-card" :style="{ '--project-color': project.color }">
    <RouterLink class="project-card-header" :to="{ name: 'printing-project', params: { id: project.id } }"
      ><h2>{{ project.title }}</h2></RouterLink
    >
    <div
      class="home-project-meter"
      :style="{ '--progress': `${progress.percent || 0}%` }"
      role="progressbar"
      :aria-label="`${project.title} progress`"
      :aria-valuenow="progress.percent || 0"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <i></i>
    </div>
    <div class="home-project-body">
      <ul>
        <li
          v-for="part in visibleParts"
          :key="part.id"
          :class="{ 'home-project-body__item--done': part.status === 'Done' }"
          :style="{ viewTransitionName: `print-part-${part.id}` }"
        >
          <button
            class="project-part-row"
            type="button"
            :aria-pressed="part.status === 'Done'"
            @click="$emit('toggle', part)"
          >
            <span class="tiny-check" aria-hidden="true">{{ part.status === "Done" ? "✓" : "" }}</span
            ><span
              ><strong>{{ part.title }}</strong
              ><small v-if="!compact"
                >{{ part.nozzleMm || 0.4 }} mm nozzle · {{ part.filamentLabel || "No filament"
                }}<template v-if="part.materialGrams"> · {{ part.materialGrams }} g</template></small
              ></span
            >
          </button>
        </li>
        <li v-if="!visibleParts.length" class="empty-state">Single-item project</li>
      </ul>
    </div>
  </article>
</template>
