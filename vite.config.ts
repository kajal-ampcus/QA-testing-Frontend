import { ServerResponse } from "node:http";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/live": {
          target: env.LIVE_VIEW_PROXY_TARGET || "http://127.0.0.1:6080",
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/live/, ""),
        },
        "/api": {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:8000",
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
          configure(proxy) {
            proxy.on("error", (_error, _request, response) => {
              if (response instanceof ServerResponse && !response.headersSent) {
                response.writeHead(503, { "Content-Type": "application/json" });
                response.end(
                  JSON.stringify({
                    detail:
                      "The QA API is unavailable. Start the backend and check that API_PROXY_TARGET matches its port.",
                  }),
                );
              }
            });
          },
        },
      },
    },
  };
});
