import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/core/**/*.test.ts", "src/workflows/**/*.test.ts"],
    environment: "node",
  },
});
