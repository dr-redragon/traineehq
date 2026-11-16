import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { withCspMeta } from "./src/lib/contentSecurityPolicy";

/**
 * Stamps the content security policy into the built index.html. Build only:
 * the dev server needs inline script and a websocket for hot reload.
 */
function csp(supabaseUrl: string | undefined): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => withCspMeta(html, supabaseUrl) },
  };
}

export default defineConfig(({ mode }) => ({
  server: { host: "::", port: 8080 },
  plugins: [react(), csp(loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL)],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
}));
