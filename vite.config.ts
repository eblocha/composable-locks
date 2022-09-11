import { defineConfig } from "vitest/config";
const config = defineConfig({
  test: {
    watch: false,
    testTimeout: 500,
  },
});

export default config;
