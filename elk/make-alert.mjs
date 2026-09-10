// Sets up FREE (basic-license) abnormal-acceleration alerting:
//  1) adds an `accel_mag` runtime field = sqrt(ax^2+ay^2+az^2) to the index
//  2) creates an Index connector that writes fired alerts to `gpssensor-alerts`
//  3) creates an "Elasticsearch query" rule that fires on free-fall / impact
//
//   node make-alert.mjs [--es http://localhost:9200] [--kb http://localhost:5601]
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ES = opt("es", "http://localhost:9200").replace(/\/$/, "");
const KB = opt("kb", "http://localhost:5601").replace(/\/$/, "");
const INDEX = "gpssensor-logs";
const ALERT_INDEX = "gpssensor-alerts";
const CONNECTOR_ID = "gps-alert-index";
const RULE_ID = "gps-freefall-rule";

// thresholds: free-fall ~ weightless (mag near 0); impact/shake = large spike
const LOW = 4.0;   // m/s^2 — below this ≈ free fall
const HIGH = 20.0; // m/s^2 — above this ≈ impact / hard shake

async function es(path, method, body) {
  const res = await fetch(`${ES}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ES ${method} ${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}
async function kb(path, method, body) {
  const res = await fetch(`${KB}${path}`, { method, headers: { "Content-Type": "application/json", "kbn-xsrf": "true" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`KB ${method} ${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}
// Best-effort delete: ignore any error (missing object, etc.)
async function kbDel(path) {
  try { await fetch(`${KB}${path}`, { method: "DELETE", headers: { "kbn-xsrf": "true" } }); } catch {}
}

// 1) runtime field (single-quoted doc[] is valid painless and avoids JSON-quote issues)
const painless =
  "double x = doc['ax'].size()==0 ? 0 : doc['ax'].value;" +
  "double y = doc['ay'].size()==0 ? 0 : doc['ay'].value;" +
  "double z = doc['az'].size()==0 ? 0 : doc['az'].value;" +
  "emit(Math.sqrt(x*x + y*y + z*z));";

await es(`/${INDEX}/_mapping`, "PUT", { runtime: { accel_mag: { type: "double", script: { source: painless } } } });
console.log("runtime field accel_mag added");

// quick sanity check
const agg = await es(`/${INDEX}/_search`, "POST", { size: 0, query: { range: { "@timestamp": { gte: "now-30m" } } }, aggs: { mn: { min: { field: "accel_mag" } }, mx: { max: { field: "accel_mag" } } } });
console.log(`accel_mag range (last 30m): min=${agg.aggregations?.mn?.value} max=${agg.aggregations?.mx?.value}`);

// 2) Index connector (delete-then-create for idempotency)
await kbDel(`/api/actions/connector/${CONNECTOR_ID}`);
await kb(`/api/actions/connector/${CONNECTOR_ID}`, "POST", {
  name: "GPS alert -> index",
  connector_type_id: ".index",
  config: { index: ALERT_INDEX, refresh: true },
});
console.log("index connector created:", CONNECTOR_ID);

// 3) Elasticsearch query rule
const esQuery = JSON.stringify({
  query: { bool: { should: [{ range: { accel_mag: { lt: LOW } } }, { range: { accel_mag: { gt: HIGH } } }], minimum_should_match: 1 } },
});

await kbDel(`/api/alerting/rule/${RULE_ID}`);
await kb(`/api/alerting/rule/${RULE_ID}`, "POST", {
  name: "Abnormal acceleration (free-fall / impact)",
  rule_type_id: ".es-query",
  consumer: "stackAlerts",
  enabled: true,
  schedule: { interval: "10s" },
  tags: ["gpssensor"],
  params: {
    searchType: "esQuery",
    timeField: "@timestamp",
    index: [INDEX],
    esQuery,
    size: 100,
    timeWindowSize: 1,
    timeWindowUnit: "m",
    thresholdComparator: ">",
    threshold: [0],
    excludeHitsFromPreviousRun: true,
    aggType: "count",
    groupBy: "all",
  },
  actions: [
    {
      group: "query matched",
      id: CONNECTOR_ID,
      frequency: { summary: false, notify_when: "onActionGroupChange", throttle: null },
      params: {
        documents: [
          {
            "@timestamp": "{{date}}",
            rule_name: "{{rule.name}}",
            message: "{{context.message}}",
            matched_count: "{{context.value}}",
          },
        ],
      },
    },
  ],
});
console.log("rule created:", RULE_ID);

console.log("\nDone. Watch alerts at:");
console.log(`  Rules:  ${KB.replace("localhost", "172.30.1.96")}/app/management/insightsAndAlerting/triggersActions/rules`);
console.log(`  Alert docs (Discover): create/te data view on '${ALERT_INDEX}*' OR query ${ES}/${ALERT_INDEX}/_search`);
