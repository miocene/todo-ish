<script>
import { useId } from "vue";
import JMButton from "../JMButton/JMButton.vue";
import "./jm-modal.css";

export default {
  name: "JMModal",
  components: { JMButton },
  props: {
    title: { type: String, required: true },
    submitText: { type: String, default: "Save" },
    submitDisabled: { type: Boolean, default: false },
    novalidate: { type: Boolean, default: false },
  },
  emits: ["submit"],
  setup() {
    return { dialogId: useId() };
  },
  methods: {
    open() {
      this.$refs.dialog.showModal();
    },
    close() {
      this.$refs.dialog.close();
    },
  },
};
</script>

<template>
  <dialog
    :id="dialogId"
    ref="dialog"
    :aria-labelledby="`${dialogId}-title`"
    class="jm-modal"
    closedby="any"
    @click.self="!('closedBy' in $refs.dialog) && close()"
  >
    <form
      class="form"
      method="dialog"
      :novalidate="novalidate"
      @submit="$emit('submit', $event)"
    >
      <header>
        <h2 :id="`${dialogId}-title`">{{ title }}</h2>
      </header>
      <div class="content">
        <slot />
      </div>
      <footer>
        <JMButton
          text="Cancel"
          view="ghost"
          :commandfor="dialogId"
          command="close"
        />
        <JMButton :text="submitText" type="submit" :disabled="submitDisabled" />
      </footer>
    </form>
  </dialog>
</template>
