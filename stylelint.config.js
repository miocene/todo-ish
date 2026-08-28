export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**"],
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
