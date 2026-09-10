// Bulk-loads a GPS Sensor Logger JSON log into Elasticsearch.
//
//   node ingest.mjs <path-to-log.json> [--es http://localhost:9200] [--index gpssensor-logs]
//
// It (1) installs/updates the index template (geo_point for lat/lon), then
// (2) bulk-indexes every sample as one document with a real @timestamp so
// Kibana's time picker and Maps work out of the box.
//
// Security is assumed OFF (local dev). For a secured cluster, set ES_USER/ES_PASS
// env vars and the script will send HTTP basic auth.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ---- args ----
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const setupOnly = args.includes("--setup-only");
const getOpt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const ES = (getOpt("es", process.env.ES_URL || "http://localhost:9200")).replace(/\/$/, "");
const INDEX = getOpt("index", "gpssensor-logs");

if (!file && !setupOnly) {
  console.error("Usage: node ingest.mjs <log.json> [--es URL] [--index NAME]");
  console.error("   or: node ingest.mjs --setup-only   (install index template only)");
  process.exit(1);
}

const authHeader = () => {
  if (process.env.ES_USER && process.env.ES_PASS) {
    const b64 = Buffer.from(`${process.env.ES_USER}:${process.env.ES_PASS}`).toString("base64");
    return { Authorization: `Basic ${b64}` };
  }
  return {};
};

async function putTemplate() {
  const tpl = JSON.parse(readFileSync(join(here, "index-template.json"), "utf8"));
  const res = await fetch(`${ES}/_index_template/gpssensor`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(tpl),
  });
  if (!res.ok) throw new Error(`template PUT failed: ${res.status} ${await res.text()}`);
  console.log("Index template 'gpssensor' installed.");
}

function* docs(log) {
  const startedAt = Number(log.session?.startedAt) || 0;
  const sessionId = log.session?.id ?? "unknown";
  const device = log.session?.device ?? "unknown";
  const deviceId = log.session?.deviceId ?? "unknown";
  const deviceName = log.session?.deviceName ?? device;
  const intervalMs = Number(log.session?.intervalMs) || 0;
  for (const s of log.samples) {
    const doc = {
      "@timestamp": new Date(startedAt + Number(s.t || 0)).toISOString(),
      session_id: sessionId,
      device,
      device_id: deviceId,
      device_name: deviceName,
      interval_ms: intervalMs,
      t_ms: Number(s.t || 0),
      alt: s.alt ?? null,
      gps_accuracy: s.acc ?? null,
      ax: s.ax, ay: s.ay, az: s.az,
      gx: s.gx, gy: s.gy, gz: s.gz,
      mx: s.mx, my: s.my, mz: s.mz,
    };
    if (s.lat != null && s.lon != null) doc.location = { lat: s.lat, lon: s.lon };
    yield doc;
  }
}

async function bulk(batch) {
  const ndjson = batch
    .map((d) => `{"index":{"_index":"${INDEX}"}}\n${JSON.stringify(d)}`)
    .join("\n") + "\n";
  const res = await fetch(`${ES}/_bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/x-ndjson", ...authHeader() },
    body: ndjson,
  });
  const json = await res.json();
  if (json.errors) {
    const firstErr = json.items.find((i) => i.index?.error)?.index?.error;
    throw new Error(`bulk had errors: ${JSON.stringify(firstErr)}`);
  }
  return json.items.length;
}

async function main() {
  if (setupOnly) {
    await putTemplate();
    console.log("Setup complete. (template only — no documents ingested)");
    return;
  }

  const log = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(log.samples)) throw new Error("Not a gpssensor log (missing 'samples').");

  await putTemplate();

  const BATCH = 2000;
  let batch = [];
  let total = 0;
  for (const d of docs(log)) {
    batch.push(d);
    if (batch.length >= BATCH) { total += await bulk(batch); batch = []; process.stdout.write(`\rindexed ${total}…`); }
  }
  if (batch.length) { total += await bulk(batch); }
  // make docs searchable immediately
  await fetch(`${ES}/${INDEX}/_refresh`, { method: "POST", headers: authHeader() });
  console.log(`\nDone. Indexed ${total} docs into '${INDEX}' (session ${log.session?.id}).`);
  console.log(`Next: open Kibana → create a data view on '${INDEX}*' with time field '@timestamp'.`);
}

main().catch((e) => { console.error("\nERROR:", e.message); process.exit(1); });
