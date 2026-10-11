import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import type { Plugin } from "vite";
import { PUBLIC_PAGES, renderPublicPageHtml, renderSitemap } from "./src/lib/publicPages";
import { withCspMeta } from "./src/lib/contentSecurityPolicy";

// Writes the Content Security Policy into index.html for production builds
// (and so into every public page copied from it). Not in dev: Vite's dev
// server injects its own inline scripts for HMR. See src/lib/contentSecurityPolicy.ts.
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) => withCspMeta(html, supabaseUrl),
    },
  };
}

// Writes welcome.html, contact.html, ... and sitemap.xml next to index.html, so
// the pages search engines may index are served with a 200 and their own head.
// See src/lib/publicPages.ts.
function publicPages(): Plugin {
  return {
    name: "public-pages",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir!;
      const shell = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      for (const page of PUBLIC_PAGES) {
        fs.writeFileSync(path.join(outDir, `${page.path.slice(1)}.html`), renderPublicPageHtml(shell, page));
      }
      fs.writeFileSync(path.join(outDir, "sitemap.xml"), renderSitemap());
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves a project site from /<repo>/, so assets need that prefix.
  // Set VITE_BASE_PATH in that build only; local dev and any root-domain host
  // keep "/" and are unaffected.
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    contentSecurityPolicy(loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL),
    publicPages(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
