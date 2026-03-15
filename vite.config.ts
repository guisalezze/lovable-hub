import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "Solaryz — CRM Multi-Projeto",
        short_name: "Solaryz",
        description: "Solaryz: CRM inteligente para gestão de projetos educacionais e nutra",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        id: "/",
        prefer_related_applications: false,
        icons: [
          {
            src: "/logo.png",
            sizes: "72x72",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "96x96",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "128x128",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "152x152",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "384x384",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "1024x1024",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Dashboard",
            description: "Abrir dashboard",
            url: "/",
            icons: [{ src: "/logo.png", sizes: "192x192" }],
          },
          {
            name: "Leads",
            short_name: "Leads",
            description: "Gerenciar leads",
            url: "/leads",
            icons: [{ src: "/logo.png", sizes: "192x192" }],
          },
          {
            name: "Tarefas",
            short_name: "Tarefas",
            description: "Ver tarefas",
            url: "/tarefas",
            icons: [{ src: "/logo.png", sizes: "192x192" }],
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,mp3}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: {
        enabled: false, // Desabilitar em desenvolvimento (habilitar apenas em produção)
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
