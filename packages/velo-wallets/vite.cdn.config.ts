import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/element.ts",
      fileName: () => "velo-wallet.js",
      formats: ["es"],
    },
    outDir: "dist/cdn",
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
    sourcemap: true,
  },
});
