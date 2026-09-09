<script>
import { useId } from "vue";
import JMButton from "../JMButton/JMButton.vue";
import JMIcon from "../JMIcon/JMIcon.vue";
import JMModal from "../JMModal/JMModal.vue";
import JMProgress from "../JMProgress/JMProgress.vue";
import "./jm-card.css";

export default {
  name: "JMCard",
  components: { JMButton, JMIcon, JMModal, JMProgress },
  props: {
    title: { type: String, required: true },
    emptyText: { type: String, required: true },
    color: { type: String, default: "#FF00FF" },
    actions: { type: Array, default: () => [] },
    progress: { type: Object, default: null },
    collapsible: { type: Boolean, default: false },
    tag: { type: String, default: "section" },
  },
  emits: ["action"],
  setup() {
    return { id: useId() };
  },
  data() {
    return { expanded: true };
  },
  beforeUnmount() {
    document.removeEventListener("pointerdown", this.handleOutsidePointer);
  },
  methods: {
    closeMenu(restoreFocus = false) {
      if (restoreFocus) this.$refs.menuButton?.focus();
      if (this.$refs.menu) this.$refs.menu.open = false;
    },
    handleMenuToggle(event) {
      if (event.target.open) document.addEventListener("pointerdown", this.handleOutsidePointer);
      else document.removeEventListener("pointerdown", this.handleOutsidePointer);
    },
    handleOutsidePointer(event) {
      if (!this.$refs.menu?.contains(event.target)) this.closeMenu();
    },
    handleMenuBlur(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) this.closeMenu();
    },
    runAction(action) {
      if (action.disabled) return;
      this.closeMenu(true);
      if (action.id === "edit") this.$refs.editModal.open();
      else {
        if (action.id === "add") this.expanded = true;
        this.$emit("action", action.id);
      }
    },
  },
};
</script>

<template>
  <component :is="tag" class="jm-card" :style="{ '--color': color }" :aria-labelledby="`${id}-title`">
    <header class="header">
      <h2 :id="`${id}-title`" class="title">
        <slot name="title">{{ title }}</slot>
        <JMProgress v-if="progress" :value="progress.value" :max="progress.max" :label="`Progress for ${title}`" />
      </h2>
      <template v-if="actions.length || collapsible">
        <template v-if="actions.length === 1">
          <JMButton
            v-for="action in actions"
            :key="action.id"
            :id="action.buttonId"
            :icon-name="action.icon"
            :aria-label="action.ariaLabel || action.label"
            :disabled="action.disabled"
            view="ghost"
            @click="runAction(action)"
          />
        </template>
        <details
          v-else-if="actions.length > 1"
          ref="menu"
          class="jm-card__menu"
          @toggle="handleMenuToggle"
          @focusout="handleMenuBlur"
          @keydown.esc.prevent.stop="closeMenu(true)"
        >
          <summary
            ref="menuButton"
            class="jm-button ghost m"
            :aria-label="`Actions for ${title}`"
          >
            <JMIcon name="kebab" />
          </summary>
          <div class="jm-card__menu-actions">
            <JMButton
              v-for="action in actions"
              :key="action.id"
              :text="action.label"
              :icon-name="action.icon"
              :aria-label="action.ariaLabel"
              :disabled="action.disabled"
              view="ghost"
              @click="runAction(action)"
            />
          </div>
        </details>
        <JMButton
          v-if="collapsible"
          :icon-name="expanded ? 'chevron-up' : 'chevron-down'"
          :aria-label="`${expanded ? 'Collapse' : 'Expand'} ${title}`"
          :aria-expanded="expanded"
          :aria-controls="`${id}-tasks`"
          view="ghost"
          @click="expanded = !expanded"
        />
      </template>
    </header>
    <ul
      v-if="$slots.list || $slots.default"
      v-show="!collapsible || expanded"
      :id="`${id}-tasks`"
      class="task-list"
      role="list"
    >
      <slot name="list"><slot /></slot>
    </ul>
    <div v-else v-show="!collapsible || expanded" :id="`${id}-tasks`" class="empty">
      {{ emptyText }}
    </div>
    <JMModal v-if="actions.some((action) => action.id === 'edit')" ref="editModal" :aria-label="`Edit ${title}`" />
  </component>
</template>
