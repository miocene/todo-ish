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
    "selector-class-pattern": [
      "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$",
      {
        message: "Expected a BEM-style class name",
      },
    ],
  },
};
