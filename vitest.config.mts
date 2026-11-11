import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __DEV__: "true" },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
