import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  return {
    build: {
      lib: {
        entry: resolve(__dirname, "index.js"),
        name: "threeAmmo",
        fileName: "three-ammo"
      },
      rollupOptions: {
        external: ["three"],
        output: {
          globals: {
            three: "three"
          }
        }
      }
    },
    worker: {
      format: "es",
      rollupOptions: {
        output: {
          entryFileNames: "assets/js/[name]-[hash].js"
        }
      }
    }
  };
});
