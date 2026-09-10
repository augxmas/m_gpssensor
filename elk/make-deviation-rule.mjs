// FREE deviation alert: over a rolling window, computes the AVERAGE of each sensor
// magnitude (accel / gyro / mag) and fires if any sample deviates more than ±10%
// from that window average. Uses an ES|QL "Elasticsearch query" rule (basic license).
//
//   node make-deviation-rule.mjs [--kb http://localhost:5601]
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const KB = opt("kb", "http://localhost:5601").replace(/\/$/, "");
const CONNECTOR_ID = "gps-alert-index"; // reuse the index connector from make-alert.mjs
const RULE_ID = "gps-deviation-rule";
const PCT = 0.05; // ±5%

async function kb(path, method, body) {
  const res = await fetch(`${KB}${path}`, { method, headers: { "Content-Type": "application/json", "kbn-xsrf": "true" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`KB ${method} ${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}
async function kbDel(path) { try { await fetch(`${KB}${path}`, { method: "DELETE", headers: { "kbn-xsrf": "true" } }); } catch {} }

const hi = (1 + PCT).toFixed(2);
const lo = (1 - PCT).toFixed(2);

// Per-sensor magnitudes via EVAL (no runtime field needed). Floors avoid firing on
// pure noise around a ~0 baseline (gyro at rest), where ±10% is meaningless.
const esql = [
  "FROM gpssensor-logs",
  "| EVAL am = SQRT(ax*ax + ay*ay + az*az), gm = SQRT(gx*gx + gy*gy + gz*gz), mm = SQRT(mx*mx + my*my + mz*mz)",
  "| STATS avg_a=AVG(am), max_a=MAX(am), min_a=MIN(am), avg_g=AVG(gm), max_g=MAX(gm), min_g=MIN(gm), avg_m=AVG(mm), max_m=MAX(mm), min_m=MIN(mm)",
  `| WHERE (avg_a > 1 AND (max_a > avg_a*${hi} OR min_a < avg_a*${lo}))`,
  `     OR (avg_g > 0.3 AND (max_g > avg_g*${hi} OR min_g < avg_g*${lo}))`,
  `     OR (avg_m > 1 AND (max_m > avg_m*${hi} OR min_m < avg_m*${lo}))`,
].join("\n");

await kbDel(`/api/alerting/rule/${RULE_ID}`);
await kb(`/api/alerting/rule/${RULE_ID}`, "POST", {
  name: `Sensor deviation from average (>${PCT * 100}%)`,
  rule_type_id: ".es-query",
  consumer: "stackAlerts",
  enabled: true,
  schedule: { interval: "10s" },
  tags: ["gpssensor"],
  params: {
    searchType: "esqlQuery",
    esqlQuery: { esql },
    timeField: "@timestamp",
    timeWindowSize: 1,
    timeWindowUnit: "m",
    thresholdComparator: ">",
    threshold: [0],
    size: 100,
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
            alert_type: "deviation_over_10pct",
            message: "{{context.message}}",
          },
        ],
      },
    },
  ],
});
console.log(`rule created: ${RULE_ID}  (±${PCT * 100}% over a 1-minute window, checked every 10s)`);
console.log("ES|QL:\n" + esql);
