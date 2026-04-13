import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: false,
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    exclude: ["node_modules", "dist", "api/index.mjs", "dist-server"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
