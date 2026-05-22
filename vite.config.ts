// Standard Vite SPA config — targets dist/ for Vercel static deployment.
// Replaces @lovable.dev/vite-tanstack-config (Cloudflare Workers target) which
// produced a Workers bundle Vercel cannot serve, causing 404 on every route.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
