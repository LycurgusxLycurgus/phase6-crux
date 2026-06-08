import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["bridgecrux/**/*.test.ts", "cruxes/**/*.test.ts"],
  },
});
