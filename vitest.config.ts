import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: { branches: 60, functions: 70, lines: 70, statements: 70 },
    },
    environment: "node",
  },
});
