<script>
import JMButton from "../JMButton/JMButton.vue";
import JMInput from "../JMInput/JMInput.vue";
import "./jm-task-item.css";

export default {
  name: "JMTaskItem",
  components: { JMButton, JMInput },
  emits: ["enter", "pin", "remove", "title-blur", "update:completed", "update:title"],
  props: {
    completable: { type: Boolean, default: true },
    completed: { type: Boolean, default: false },
    completionInputId: { type: String, default: "" },
    editable: { type: Boolean, default: true },
    pinIcon: { type: String, default: "" },
    pinLabel: { type: String, default: "" },
    removable: { type: Boolean, default: false },
    removeLabel: { type: String, default: "" },
    taskId: { type: String, required: true },
    title: { type: String, default: "" },
    titleHref: { type: String, default: "" },
    titleInputId: { type: String, default: "" },
    titleLabel: { type: String, default: "Task title" },
  },
  computed: {
    completionId() {
      return this.completionInputId || `task-item-complete-${this.taskId}`;
    },
    hasActions() {
      return Boolean(this.pinIcon || this.removable || this.$slots.actions);
    },
    resolvedPinLabel() {
      return this.pinLabel || `Pin ${this.title || "untitled task"}`;
    },
    resolvedRemoveLabel() {
      return this.removeLabel || `Remove ${this.title || "untitled task"}`;
    },
    titleId() {
      return this.titleInputId || `task-item-title-${this.taskId}`;
    },
  },
};
</script>

<template>
  <li class="task-item" :class="{ completed: completed }">
    <input
      v-if="completable"
      :id="completionId"
      class="checkbox"
      type="checkbox"
      :checked="completed"
      :aria-label="`Complete ${title || 'untitled task'}`"
      @change="$emit('update:completed', $event.target.checked)"
    />

    <div class="content">
      <a
        v-if="titleHref"
        class="task-item__title task-item__title-link"
        :href="titleHref"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ title }}
        <span class="sr-only"> (opens in a new tab)</span>
      </a>
      <JMInput
        v-else-if="editable"
        :id="titleId"
        class="task-title"
        name="task-title"
        view="ghost"
        size="s"
        multiline
        enterkeyhint="next"
        :aria-label="titleLabel"
        :model-value="title"
        @blur="$emit('title-blur', $event)"
        @update:model-value="$emit('update:title', $event)"
        @keydown.enter="$emit('enter', $event)"
      />
      <span v-else class="task-item__title">{{ title }}</span>
      <div v-if="$slots.details" class="task-item__details">
        <slot name="details" />
      </div>
    </div>

    <div v-if="hasActions" class="actions">
      <JMButton
        v-if="removable"
        icon-name="remove"
        size="s"
        view="ghost"
        :aria-label="resolvedRemoveLabel"
        @click="$emit('remove')"
      />
      <JMButton
        v-if="pinIcon"
        :icon-name="pinIcon"
        size="s"
        view="ghost"
        :aria-label="resolvedPinLabel"
        @click="$emit('pin')"
      />
      <slot name="actions" />
    </div>
  </li>
</template>
