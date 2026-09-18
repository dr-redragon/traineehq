import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * The dev server for the redesign preview harness.
 *
 * Identical to vite.config.ts but for one alias: `@/integrations/supabase/client`
 * resolves to the fixture client in e2e/harness, so the signed-in pages render
 * against invented rows instead of requiring an account. It is a separate
 * config rather than a flag on the main one so that the alias cannot possibly
 * be picked up by a real build.
 *
 *   npx vite --config vite.preview.config.ts
 *   http://127.0.0.1:5180/e2e/harness/preview.html?page=dashboard
 */
export default defineConfig({
  server: { host: "127.0.0.1", port: 5180 },
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@\/integrations\/supabase\/client$/,
        replacement: path.resolve(__dirname, "./e2e/harness/supabase-fixture.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    // Same dedupe as the main config: two copies of React in the graph and
    // every hook throws.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
