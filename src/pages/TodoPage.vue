<script>
import SectionTabs from "../components/SectionTabs.vue";
import { actions, state } from "../app/store.js";

export default {
  name: "TodoPage",
  components: { SectionTabs },
  directives: {
    focus: {
      mounted(element, binding) {
        if (binding.value) element.focus();
      },
      updated(element, binding) {
        if (binding.value && !binding.oldValue) element.focus();
      },
    },
  },
  data() {
    return { editing: "", state };
  },
  computed: {
    sorted() {
      return [...this.state.todos].sort(
        (a, b) =>
          Number(Boolean(a.done)) - Number(Boolean(b.done)) || (a.date || "9999").localeCompare(b.date || "9999"),
      );
    },
  },
  methods: {
    async add() {
      actions.addTodo();
      await this.$nextTick();
      this.editing = this.state.todos.at(-1)?.id || "";
    },
    clean(item) {
      actions.removeEmptyTodo(item.id);
    },
    changeTiming(item, value) {
      item.dateMode = value;
      if (value === "none") item.date = "";
    },
    toggleTodo(id) {
      actions.toggleTodo(id);
    },
  },
};
</script>

<template>
  <section>
    <div class="section-bar">
      <SectionTabs group="do" /><button class="mini-button section-create" type="button" @click="add">
        New to-do ＋
      </button>
    </div>
    <h1 class="sr-only">To-dos</h1>
    <ul class="list-panel">
      <li v-for="item in sorted" :key="item.id" class="simple-list-row" :class="{ 'simple-list-row--done': item.done }">
        <button
          class="check-button"
          type="button"
          :aria-pressed="Boolean(item.done)"
          :aria-label="`Complete ${item.title}`"
          @click="toggleTodo(item.id)"
        >
          ✓</button
        ><input
          v-focus="item.id === editing"
          v-model="item.title"
          class="inline-title"
          aria-label="To-do title"
          placeholder="New to-do"
          @blur="clean(item)"
        />
        <div class="todo-date-control">
          <select :value="item.dateMode" aria-label="Timing" @change="changeTiming(item, $event.target.value)">
            <option value="none">No date</option>
            <option value="on">On</option>
            <option value="before">Before</option></select
          ><input v-if="item.dateMode !== 'none'" v-model="item.date" type="date" aria-label="Due date" />
        </div>
      </li>
    </ul>
  </section>
</template>
