import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  return {
    plugins: [],
    build: {
      lib: {
        entry: resolve(__dirname, "index.js"),
        name: "threeAmmo",
        fileName: "three-ammo",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["three"],
        output: {
          globals: {
            three: "three",
          },
        },
      },
    },
    worker: {
      format: "iife",
      rollupOptions: {
        output: {
          entryFileNames: "assets/js/[name]-[hash].js",
        },
      },
    },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  };
});
