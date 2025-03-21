import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(),
    Icons({
      compiler: "jsx",
      jsx: "react",
    }),
  ],
});
