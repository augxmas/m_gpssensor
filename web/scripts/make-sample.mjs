// Generates a synthetic log (a short circular walk with wavy sensor data) so the
// Visualize tab can be tried without a phone. Output: public/sample-log.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

const intervalMs = 200;
const n = 600; // 2 minutes
const startedAt = 1735689600000; // fixed timestamp (2025-01-01) — deterministic output
const lat0 = 37.5665, lon0 = 126.978; // Seoul City Hall
const R = 0.0009; // ~100 m radius loop

const samples = [];
for (let k = 0; k < n; k++) {
  const t = k * intervalMs;
  const ang = (k / n) * Math.PI * 2;
  const sec = t / 1000;
  samples.push({
    t,
    lat: +(lat0 + R * Math.sin(ang)).toFixed(7),
    lon: +(lon0 + R * Math.cos(ang) * 0.8).toFixed(7),
    alt: +(40 + 3 * Math.sin(ang * 2)).toFixed(2),
    acc: +(4 + 2 * Math.abs(Math.sin(ang))).toFixed(1),
    ax: +(0.4 * Math.sin(sec * 2.0)).toFixed(4),
    ay: +(0.3 * Math.cos(sec * 1.7)).toFixed(4),
    az: +(9.81 + 0.5 * Math.sin(sec * 3.1)).toFixed(4),
    gx: +(0.2 * Math.sin(sec * 1.1)).toFixed(4),
    gy: +(0.15 * Math.cos(sec * 0.9)).toFixed(4),
    gz: +(0.6 * Math.sin(sec * 0.3)).toFixed(4),
    mx: +(25 + 8 * Math.cos(ang)).toFixed(2),
    my: +(-8 + 8 * Math.sin(ang)).toFixed(2),
    mz: +(-42 + 3 * Math.sin(sec * 0.5)).toFixed(2),
  });
}

const log = {
  format: "gpssensor-log",
  version: 1,
  session: {
    id: "sample_walk",
    startedAt,
    intervalMs,
    device: "synthetic sample",
    sampleCount: n,
    durationMs: (n - 1) * intervalMs,
  },
  samples,
};

const destDir = join(webRoot, "public");
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, "sample-log.json");
writeFileSync(dest, JSON.stringify(log));
console.log(`Wrote ${dest} (${n} samples)`);
