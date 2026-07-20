const config = {
  "*.{js,mjs,cjs,ts}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml,css}": ["prettier --write"],
};

export default config;
