<script>
import SectionTabs from "../components/SectionTabs.vue";
import { actions, state } from "../app/store.js";

export default {
  name: "ChoresPage",
  components: { SectionTabs },
  data() {
    return { state };
  },
  methods: {
    toggleChore(id) {
      actions.toggleChore(id);
    },
  },
};
</script>

<template>
  <section>
    <div class="section-bar"><SectionTabs group="do" /></div>
    <h1 class="sr-only">Chores</h1>
    <ul class="list-panel">
      <li v-for="item in state.chores" :key="item.id" class="simple-list-row">
        <button class="check-button" type="button" :aria-label="`Complete ${item.title}`" @click="toggleChore(item.id)">
          ✓</button
        ><input v-model="item.title" class="inline-title" aria-label="Chore title" /><time :datetime="item.due">{{
          item.due
        }}</time>
      </li>
    </ul>
  </section>
</template>
