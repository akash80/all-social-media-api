import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.e2e.test.ts"],
    testTimeout: 120000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "all-social-media-api": path.resolve(__dirname, "./dist/index.js"),
    },
  },
});
