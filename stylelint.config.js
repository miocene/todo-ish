export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**"],
  overrides: [
    {
      // Keep the original files empty while their styles live in styles/style.css.
      files: ["src/**/*.css", "styles/normalisation.css"],
      rules: { "no-empty-source": null },
    },
  ],
  rules: {
    "custom-property-empty-line-before": null,
    "no-descending-specificity": null,
    "selector-class-pattern": null,
  },
};
