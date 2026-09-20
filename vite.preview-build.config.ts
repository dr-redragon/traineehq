import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Builds the preview harness into a static folder you can open anywhere.
 *
 * Same idea as vite.preview.config.ts — the Supabase client is aliased onto
 * the fixture, so the real pages render against invented rows — but it
 * produces files rather than running a server, so the redesign can be looked
 * at by someone who does not want to run one.
 *
 * Nothing here is part of the app's own build: `npm run build` uses
 * vite.config.ts and never loads this file or the alias in it.
 *
 *   npx vite build --config vite.preview-build.config.ts
 */
export default defineConfig({
  // The harness page is the entry, not the app's own index.html. Vite's
  // default root would have built the real app instead, which is not what
  // this config is for.
  root: path.resolve(__dirname, "e2e/harness"),
  base: "./",
  // The fixture replaces the Supabase client, but two helpers read the project
  // URL and anon key directly (storageUtils, resourceDownloads), so without
  // this Vite would inline the real values into a bundle whose whole point is
  // that it touches nothing real. They are blanked: the preview never calls
  // either path, and a build meant to be handed round should carry no
  // credentials at all, public-by-design or not.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": '""',
  },
  build: {
    outDir: path.resolve(__dirname, "dist-preview"),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, "e2e/harness/preview.html") },
  },
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@\/integrations\/supabase\/client$/,
        replacement: path.resolve(__dirname, "./e2e/harness/supabase-fixture.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
