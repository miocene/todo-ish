<script>
import JMIcon from "../JMIcon/JMIcon.vue";
import "./jm-task-card.css";

export default {
  name: "JMTaskCard",
  components: { JMIcon },
  emits: ["drag-end", "drag-start", "enter", "pin", "remove", "update:completed", "update:title"],
  props: {
    canDrag: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    completionInputId: { type: String, default: "" },
    editable: { type: Boolean, default: true },
    pinIcon: { type: String, default: "" },
    pinLabel: { type: String, default: "" },
    removable: { type: Boolean, default: false },
    removeLabel: { type: String, default: "" },
    reserveDragSpace: { type: Boolean, default: false },
    taskId: { type: String, required: true },
    title: { type: String, default: "" },
    titleInputId: { type: String, default: "" },
  },
  computed: {
    completionId() {
      return this.completionInputId || `task-card-complete-${this.taskId}`;
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
      return this.titleInputId || `task-card-title-${this.taskId}`;
    },
  },
};
</script>

<template>
  <div
    class="task-item"
    :class="{
      'task-item--completed': completed,
      'task-item--drag-column': canDrag || reserveDragSpace,
    }"
  >
    <span
      v-if="canDrag"
      class="task-item__drag-handle"
      draggable="true"
      aria-hidden="true"
      @dragend="$emit('drag-end', $event)"
      @dragstart="$emit('drag-start', $event)"
    >
      <JMIcon name="grip" />
    </span>
    <span v-else-if="reserveDragSpace" class="task-item__drag-handle-placeholder" />

    <label class="task-item__visually-hidden" :for="completionId"> Complete {{ title || "untitled task" }} </label>
    <input
      :id="completionId"
      class="task-item__checkbox"
      type="checkbox"
      :checked="completed"
      @change="$emit('update:completed', $event.target.checked)"
    />

    <div class="task-item__content">
      <template v-if="editable">
        <label class="task-item__visually-hidden" :for="titleId">Task title</label>
        <textarea
          :id="titleId"
          class="task-item__title"
          name="task-title"
          rows="1"
          enterkeyhint="next"
          :value="title"
          @input="$emit('update:title', $event.target.value)"
          @keydown.enter="$emit('enter', $event)"
        />
      </template>
      <span v-else class="task-item__title">{{ title }}</span>
      <div v-if="$slots.details" class="task-item__details">
        <slot name="details" />
      </div>
    </div>

    <div v-if="hasActions" class="task-item__actions">
      <button
        v-if="pinIcon"
        class="task-item__action task-item__pin"
        type="button"
        :aria-label="resolvedPinLabel"
        @click="$emit('pin')"
      >
        <JMIcon :name="pinIcon" />
      </button>
      <button
        v-if="removable"
        class="task-item__action task-item__remove"
        type="button"
        :aria-label="resolvedRemoveLabel"
        @click="$emit('remove')"
      >
        <JMIcon name="remove" />
      </button>
      <slot name="actions" />
    </div>
  </div>
</template>
