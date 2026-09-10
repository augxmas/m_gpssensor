import { defineConfig, type Plugin } from "vite";
import type { Connect } from "vite";
import react from "@vitejs/plugin-react";

// Android only treats a download as an installable app when it arrives with the
// APK MIME type. Vite/sirv doesn't know the `.apk` extension and sends an empty
// Content-Type, so the phone saves it as a generic .zip that won't install.
// This plugin sets the correct headers for any *.apk request (dev + preview).
function apkMime(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? "").split("?")[0];
    if (path.endsWith(".apk")) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", 'attachment; filename="GpsSensorLogger.apk"');
    }
    next();
  };
  return {
    name: "apk-mime",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), apkMime()],
  server: { host: true },
  preview: { host: true },
});
