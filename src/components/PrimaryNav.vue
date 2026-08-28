<script>
import { RouterLink } from "vue-router";
import { primaryNavigation } from "../app/navigation.js";

export default {
  name: "PrimaryNav",
  components: { RouterLink },
  props: {
    section: { type: String, required: true },
  },
  data() {
    return {
      longPressed: false,
      longPressTimer: undefined,
      open: "",
      primaryNavigation,
    };
  },
  watch: {
    section() {
      this.open = "";
    },
  },
  beforeUnmount() {
    window.clearTimeout(this.longPressTimer);
  },
  methods: {
    startLongPress(menu) {
      this.longPressed = false;
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = window.setTimeout(() => {
        this.open = menu;
        this.longPressed = true;
      }, 450);
    },
    finishLongPress(event) {
      window.clearTimeout(this.longPressTimer);
      if (this.longPressed) event.preventDefault();
      if (["click", "pointercancel"].includes(event.type)) this.longPressed = false;
    },
    openShortcuts(item) {
      this.open = item.shortcuts ? item.group : "";
    },
    closeAfterFocus(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) this.open = "";
    },
  },
};
</script>

<template>
  <nav class="bottom-nav" aria-label="Main" @mouseleave="open = ''">
    <div
      v-for="item in primaryNavigation"
      :key="item.group"
      class="nav-cluster"
      @mouseenter="openShortcuts(item)"
      @focusin="openShortcuts(item)"
      @focusout="closeAfterFocus"
    >
      <RouterLink
        class="nav-primary"
        :to="item.to"
        :data-nav-group="item.group"
        :aria-current="section === item.group ? 'page' : undefined"
        :aria-expanded="item.shortcuts ? open === item.group : undefined"
        @pointerdown="item.shortcuts && startLongPress(item.group)"
        @pointerup="finishLongPress"
        @pointercancel="finishLongPress"
        @click="finishLongPress"
        ><span class="nav-icon" aria-hidden="true">{{ item.icon }}</span
        ><small>{{ item.label }}</small></RouterLink
      >
      <div
        v-if="item.shortcuts"
        v-show="open === item.group"
        class="nav-jump"
        :aria-label="`${item.shortcutLabel || item.label} shortcuts`"
      >
        <RouterLink v-for="shortcut in item.shortcuts" :key="shortcut.to.name" class="nav-jump-item" :to="shortcut.to"
          ><span aria-hidden="true">{{ shortcut.icon }}</span
          ><strong>{{ shortcut.label }}</strong></RouterLink
        >
      </div>
    </div>
  </nav>
</template>
