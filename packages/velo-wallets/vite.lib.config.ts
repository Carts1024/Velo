import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        config: "src/config.ts",
        browser: "src/browser.ts",
        element: "src/element.ts",
        react: "src/react.tsx",
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    outDir: "dist",
    rollupOptions: {
      external: [
        "react",
        "react/jsx-runtime",
        "@creit-tech/stellar-wallets-kit",
        "@creit-tech/stellar-wallets-kit/modules/utils",
      ],
    },
    sourcemap: true,
  },
});
