// Copies the freshly built debug APK into the web app's public/downloads folder
// so the "Get the app" page can serve it. Run from web/:  npm run sync-apk
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");

const src = join(repoRoot, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const destDir = join(webRoot, "public", "downloads");
const dest = join(destDir, "app-debug.apk");

if (!existsSync(src)) {
  console.error(`APK not found: ${src}`);
  console.error("Build it first:  cd android && ./gradlew assembleDebug");
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Copied APK -> ${dest}`);
