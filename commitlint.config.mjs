const config = {
  extends: ["@commitlint/config-conventional"],

  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "style", "docs", "test", "chore", "perf", "ci", "revert"],
    ],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
    "header-max-length": [2, "always", 100],
  },
};

export default config;
