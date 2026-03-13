import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { execSync } from "child_process";
import pkg from "./package.json";

const getVersion = (): string => {
  try {
    return execSync("git describe --tags --always --abbrev=7", { encoding: "utf8" }).trim();
  } catch {
    return pkg.version;
  }
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@breed-club/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      // SSR health stamp pages served by the API (no /api prefix)
      "^/dogs/[^/]+/health": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
