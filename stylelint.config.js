export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**"],
  overrides: [
    {
      // Allow empty stylesheets while component styles are being organized.
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
