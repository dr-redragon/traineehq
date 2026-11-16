import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("."),
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [here("./src/test/setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": here("./src") },
  },
});
