import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pharmacyBff = "http://localhost:4102";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": {
        target: pharmacyBff,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": {
        target: pharmacyBff,
        changeOrigin: true,
      },
    },
  },
});
