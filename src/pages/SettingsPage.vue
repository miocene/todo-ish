<script>
export default {
  name: "SettingsPage",
};
</script>

<template>
  <section>
    <header class="view-head">
      <div>
        <p class="eyebrow">Done-ish</p>
        <h1>Settings.</h1>
        <p class="view-head-copy">The deliberately strict account model, all by itself.</p>
      </div>
    </header>
    <div class="settings-grid">
      <article class="settings-card risk-card">
        <h2>Passkey & access</h2>
        <p>Exactly one passkey, with no email, password, recovery code, or admin reset.</p>
        <div class="setting-row"><span>Credential</span><strong>Julia’s passkey</strong></div>
      </article>
    </div>
  </section>
</template>
