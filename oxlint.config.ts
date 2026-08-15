import { defineConfig } from "oxlint";

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: "deny",
  },
  plugins: ["typescript"],
  rules: {
    "@typescript-eslint/require-await": "error",
  },
});
