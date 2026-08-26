<script>
export default {
  name: "TaskCard",
  props: {
    title: { type: String, required: true },
    items: { type: Array, required: true },
    empty: { type: String, default: "Nothing here. Lovely." },
  },
  emits: ["toggle"],
};
</script>

<template>
  <section class="home-task-card">
    <h2>{{ title }}</h2>
    <ul>
      <li
        v-for="item in items"
        :key="item.id"
        class="home-task-row"
        :class="{ 'home-task-row--done': item.done }"
        :style="{ viewTransitionName: `home-task-${item.kind}-${item.id}` }"
      >
        <button
          class="home-task-button"
          type="button"
          :aria-pressed="Boolean(item.done)"
          @click="$emit('toggle', item)"
        >
          <span class="check-button" aria-hidden="true">{{ item.done ? "✓" : "" }}</span
          ><strong>{{ item.title }}</strong>
        </button>
      </li>
      <li v-if="!items.length" class="empty-state">{{ empty }}</li>
    </ul>
  </section>
</template>
