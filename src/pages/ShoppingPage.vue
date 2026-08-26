<script>
import { actions, state } from "../app/store.js";

export default {
  name: "ShoppingPage",
  data() {
    return { state };
  },
  computed: {
    items() {
      return [...this.state.shopping].sort((a, b) => Number(Boolean(a.done)) - Number(Boolean(b.done)));
    },
  },
  methods: {
    clean(item) {
      actions.removeEmptyShopping(item.id);
    },
    toggleShopping(id) {
      actions.toggleShopping(id);
    },
    addShopping() {
      actions.addShopping();
    },
  },
};
</script>

<template>
  <section class="shopping-screen">
    <h1 class="sr-only">Buy</h1>
    <ul class="list-panel">
      <li v-for="item in items" :key="item.id" class="simple-list-row" :class="{ 'simple-list-row--done': item.done }">
        <button
          class="shop-check"
          type="button"
          :aria-pressed="Boolean(item.done)"
          :aria-label="`${item.done ? 'Mark unbought' : 'Mark bought'} ${item.title}`"
          @click="toggleShopping(item.id)"
        >
          {{ item.done ? "✓" : "" }}</button
        ><strong v-if="item.linked">{{ item.title }}</strong
        ><input v-else v-model="item.title" class="inline-title" aria-label="Shopping item title" @blur="clean(item)" />
      </li>
    </ul>
    <button class="list-add-row" type="button" @click="addShopping">＋ Add item</button>
  </section>
</template>
