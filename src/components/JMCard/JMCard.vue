<script>
import { useId } from "vue";
import JMButton from "../JMButton/JMButton.vue";
import JMIcon from "../JMIcon/JMIcon.vue";
import JMInput from "../JMInput/JMInput.vue";
import JMProgress from "../JMProgress/JMProgress.vue";
import "./jm-card.css";

export default {
  name: "JMCard",
  components: { JMButton, JMIcon, JMInput, JMProgress },
  props: {
    title: { type: String, required: true },
    color: { type: String, default: "#FF00FF" },
    actions: { type: Array, default: () => [] },
    progress: { type: Object, default: null },
    collapsible: { type: Boolean, default: false },
    tag: { type: String, default: "section" },
  },
  emits: ["action", "update:title"],
  setup() {
    return { id: useId() };
  },
  data() {
    return { expanded: true, editing: false, draftTitle: "" };
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
      if (action.id === "edit") this.editTitle();
      else {
        if (action.id === "add") this.expanded = true;
        this.$emit("action", action.id);
      }
    },
    editTitle() {
      if (!this.actions.some((action) => action.id === "edit" && !action.disabled)) return;
      this.draftTitle = this.title;
      this.editing = true;
      this.$nextTick(() => document.getElementById(`${this.id}-input`)?.select());
    },
    finishEditing(save = true, restoreFocus = false) {
      if (!this.editing) return;
      const title = this.draftTitle.trim();
      if (save && title && title !== this.title) this.$emit("update:title", title);
      this.editing = false;
      if (restoreFocus) this.$nextTick(() => this.$refs.menuButton?.focus());
    },
    handleTitleKeydown(event) {
      if (event.isComposing) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        this.finishEditing(event.key === "Enter", true);
      }
    },
  },
};
</script>

<template>
  <component :is="tag" class="jm-card" :style="{ '--color': color }" :aria-labelledby="`${id}-title`">
    <header class="jm-card__header">
      <div class="jm-card__identity">
        <h2 v-show="!editing" :id="`${id}-title`" class="jm-card__title">
          <slot name="title">{{ title }}</slot>
        </h2>
        <JMInput
          v-if="editing"
          :id="`${id}-input`"
          v-model="draftTitle"
          class="jm-card__title"
          aria-label="Card title"
          name="card-title"
          view="ghost"
          @blur="finishEditing()"
          @keydown="handleTitleKeydown"
        />
        <JMProgress
          v-if="progress"
          :value="progress.value"
          :max="progress.max"
          :text="progress.text"
          :label="`Progress for ${title}`"
        />
      </div>
      <div v-if="actions.length || collapsible" class="jm-card__actions">
        <JMButton
          v-if="actions.length === 1"
          :text="actions[0].label"
          :aria-label="actions[0].ariaLabel"
          :disabled="actions[0].disabled"
          view="ghost"
          @click="runAction(actions[0])"
        />
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
            class="jm-button jm-button--ghost jm-button--m"
            :aria-label="`Actions for ${title}`"
          >
            <JMIcon name="kebab" />
          </summary>
          <div class="jm-card__menu-actions">
            <JMButton
              v-for="action in actions"
              :key="action.id"
              :text="action.label"
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
      </div>
    </header>
    <ul v-show="!collapsible || expanded" :id="`${id}-tasks`" class="jm-card__tasks" role="list">
      <slot />
    </ul>
  </component>
</template>
