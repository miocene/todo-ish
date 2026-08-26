<script>
import { RouterLink } from "vue-router";
import { stockOwned } from "../domain/inventory.js";
import { stitchProgress, stitchStatusFromThreads } from "../domain/stitching.js";

export default {
  name: "StitchProjectCard",
  components: { RouterLink },
  props: {
    project: { type: Object, required: true },
    compact: Boolean,
    stock: { type: Array, required: true },
  },
  emits: ["update-crosses"],
  computed: {
    progress() {
      return stitchProgress(this.project);
    },
    status() {
      return stitchStatusFromThreads(this.project);
    },
    visibleThreads() {
      return this.compact
        ? this.project.threads.filter((thread) => Number(thread.required) > stockOwned(this.stock, thread.catalogId))
        : this.project.threads;
    },
  },
  methods: {
    number(value) {
      return Number(value || 0).toLocaleString("en-NL");
    },
    code(thread) {
      return thread.label.match(/DMC\s+([^ ·]+)/i)?.[1] || thread.catalogId;
    },
  },
};
</script>

<template>
  <article class="stitch-project-card" :style="{ '--project-color': project.color }">
    <RouterLink class="stitch-card-header" :to="{ name: 'stitch-project', params: { id: project.id } }"
      ><span
        ><strong>{{ project.title }}</strong
        ><small>{{ status }}</small></span
      ><span>{{ number(progress.completed) }} / {{ number(progress.total) }}</span></RouterLink
    >
    <div class="stitch-progress-line" :style="{ '--progress': `${progress.percent}%` }"></div>
    <div class="stitch-card-body">
      <div
        v-for="thread in visibleThreads"
        :key="thread.id"
        class="stitch-thread-row"
        :class="{ 'stitch-thread-row--compact': compact }"
      >
        <strong>{{ compact ? code(thread) : thread.label }}</strong
        ><template v-if="!compact"
          ><span>* {{ number(thread.required) }} *</span
          ><input
            :value="thread.completedCrosses"
            type="number"
            min="0"
            :max="thread.totalCrosses"
            :aria-label="`Completed crosses for ${thread.label}`"
            @change="$emit('update-crosses', thread, $event.target.value)"
          /><span>/ {{ number(thread.totalCrosses) }}</span></template
        >
      </div>
      <p v-if="!visibleThreads.length" class="empty-state">
        {{ compact ? "Materials are covered." : "No thread list yet." }}
      </p>
    </div>
  </article>
</template>
