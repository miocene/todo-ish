# Project quality policy

- CSS class names do not need to follow BEM or another enforced naming pattern.
- Target modern browsers. Compatibility fallbacks, feature-detection branches, and polyfills are optional; do not add them solely to satisfy generic guidance. Missing fallbacks may be reported as warnings, but must not block implementation, review, builds, or deployment.
- Accessibility enhancements and audits are optional. Accessibility findings, including focus, ARIA, keyboard-accessibility, and touch-target checks, may be reported as warnings, but must not block implementation, review, builds, or deployment. Preserve existing accessibility features unless a requested change affects them.
- This policy overrides generic skill recommendations about accessibility and browser fallbacks for this repository.
- Keep functional, data-integrity, authentication, syntax, and build failures blocking. Do not suppress an entire test or command just because it also contains advisory checks.
- In browser tests, use `advisory((expect) => ...)` from `tests/app-fixture.js` for accessibility, viewport-reachability, and fallback assertions. Keep functional assertions outside that callback. The helper records assertion failures as warnings and rethrows other errors.

See `docs/development.md` for the commands and configuration files.
