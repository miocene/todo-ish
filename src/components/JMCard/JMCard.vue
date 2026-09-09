<script>
import { useId } from "vue";
import JMButton from "../JMButton/JMButton.vue";
import JMProgress from "../JMProgress/JMProgress.vue";
import "./jm-card.css";

export default {
  name: "JMCard",
  components: { JMButton, JMProgress },
  props: {
    title: { type: String, required: true },
    emptyText: { type: String, required: true },
    color: { type: String, default: null },
    actions: { type: Array, default: () => [] },
    progress: { type: Object, default: null },
    collapsible: { type: Boolean, default: false },
    collapsed: { type: Boolean, default: false },
    tag: { type: String, default: "section" },
  },
  emits: ["action"],
  setup() {
    return { id: useId() };
  },
  data() {
    return { expanded: !this.collapsed };
  },
  watch: {
    collapsed(value) {
      this.expanded = !value;
    },
  },
  methods: {
    closeMenu() {
      this.$refs.menu?.hidePopover();
      this.$refs.menuButton?.$el.focus();
    },
    runAction(action) {
      if (action.disabled) return;
      this.closeMenu();
      if (action.id === "add") this.expanded = true;
      this.$emit("action", action.id);
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
        <template v-else-if="actions.length > 1">
          <JMButton
            ref="menuButton"
            icon-name="kebab"
            view="ghost"
            :aria-label="`Actions for ${title}`"
            :popovertarget="`${id}-menu`"
          />
          <div :id="`${id}-menu`" ref="menu" class="jm-popover jm-card__menu-actions" popover>
            <JMButton
              v-for="action in actions"
              :key="action.id"
              :text="action.label"
              :icon-name="action.icon"
              :aria-label="action.ariaLabel"
              :disabled="action.disabled"
              view="clear"
              @click="runAction(action)"
            />
          </div>
        </template>
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
  </component>
</template>
