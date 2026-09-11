<script>
import "./jm-modal.css";

export default {
  name: "JMModal",
  methods: {
    open() {
      this.$refs.dialog.showModal();
    },
    close() {
      this.$refs.dialog.close();
    },
    handleBackdropClick(event) {
      const dialog = this.$refs.dialog;
      if ("closedBy" in dialog || event.target !== dialog) return;
      const { left, right, top, bottom } = dialog.getBoundingClientRect();
      if (
        event.clientX < left ||
        event.clientX > right ||
        event.clientY < top ||
        event.clientY > bottom
      ) {
        dialog.close();
      }
    },
  },
};
</script>

<template>
  <dialog
    ref="dialog"
    class="jm-modal"
    closedby="any"
    @click="handleBackdropClick"
  >
    <slot />
  </dialog>
</template>
