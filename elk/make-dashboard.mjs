// Builds Kibana Lens line charts (accel/gyro/mag, x/y/z series) + a dashboard that
// also embeds the gps-live-map, so the phone's time-series can be viewed in Kibana.
//   node make-dashboard.mjs [--kb http://localhost:5601]
const args = process.argv.slice(2);
const getOpt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const KB = getOpt("kb", "http://localhost:5601").replace(/\/$/, "");
const DV = "gpssensor";

async function api(path, method, body) {
  const res = await fetch(`${KB}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "kbn-xsrf": "true" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// App line colors: x = blue, y = green, z = orange (matches the phone app).
const AXIS_COLORS = ["#2F81F7", "#3FB950", "#F0883E"];

// Build a Lens XY line viz with three numeric series over @timestamp.
function lensAttrs(title, fields) {
  const layerId = "layer1";
  const timeCol = "c_time";
  // Small fixed bucket so the waveform's fluctuations are visible (not smoothed away).
  const cols = { [timeCol]: { label: "@timestamp", dataType: "date", operationType: "date_histogram", sourceField: "@timestamp", isBucketed: true, scale: "interval", params: { interval: "1s", includeEmptyRows: false, dropPartials: false } } };
  const accessors = [];
  const yConfig = [];
  fields.forEach((f, i) => {
    const id = `c_${f}`;
    accessors.push(id);
    cols[id] = { label: f, dataType: "number", operationType: "average", sourceField: f, isBucketed: false, scale: "ratio" };
    yConfig.push({ forAccessor: id, color: AXIS_COLORS[i], axisMode: "left" });
  });
  return {
    title,
    visualizationType: "lnsXY",
    state: {
      datasourceStates: {
        formBased: { layers: { [layerId]: { columns: cols, columnOrder: [timeCol, ...accessors], incompleteColumns: {} } } },
      },
      visualization: {
        legend: { isVisible: true, position: "right" },
        valueLabels: "hide",
        preferredSeriesType: "line",
        layers: [{
          layerId, accessors, position: "top", seriesType: "line",
          showGridlines: false, layerType: "data", xAccessor: timeCol,
          yConfig,
        }],
      },
      query: { query: "", language: "kuery" },
      filters: [],
    },
  };
}

const CHARTS = [
  { id: "gps-accel", title: "Accelerometer (ax/ay/az)", fields: ["ax", "ay", "az"] },
  { id: "gps-gyro", title: "Gyroscope (gx/gy/gz)", fields: ["gx", "gy", "gz"] },
  { id: "gps-mag", title: "Magnetometer (mx/my/mz)", fields: ["mx", "my", "mz"] },
];

for (const c of CHARTS) {
  await api(`/api/saved_objects/lens/${c.id}?overwrite=true`, "POST", {
    attributes: lensAttrs(c.title, c.fields),
    references: [{ type: "index-pattern", id: DV, name: "indexpattern-datasource-layer-layer1" }],
  });
  console.log("lens created:", c.id);
}

// Dashboard: map on top, then the three charts stacked (48-column grid).
const panels = [];
const refs = [];
const layout = [
  { ref: "map-gps", type: "map", id: "gps-live-map", x: 0, y: 0, w: 48, h: 14 },
  { ref: "p-accel", type: "lens", id: "gps-accel", x: 0, y: 14, w: 48, h: 11 },
  { ref: "p-gyro", type: "lens", id: "gps-gyro", x: 0, y: 25, w: 48, h: 11 },
  { ref: "p-mag", type: "lens", id: "gps-mag", x: 0, y: 36, w: 48, h: 11 },
];
layout.forEach((p, idx) => {
  const pi = String(idx + 1);
  panels.push({
    version: "9.4.2",
    type: p.type,
    panelIndex: pi,
    gridData: { x: p.x, y: p.y, w: p.w, h: p.h, i: pi },
    embeddableConfig: { enhancements: {} },
    panelRefName: `panel_${pi}`,
  });
  refs.push({ name: `panel_${pi}`, type: p.type, id: p.id });
});

const dash = await api(`/api/saved_objects/dashboard/gps-dashboard?overwrite=true`, "POST", {
  attributes: {
    title: "GPS Sensor Live Dashboard",
    description: "Map + accel/gyro/mag time-series from gpssensor-*",
    panelsJSON: JSON.stringify(panels),
    optionsJSON: JSON.stringify({ useMargins: true, syncColors: false, hidePanelTitles: false }),
    timeRestore: true,
    timeFrom: "now-15m",
    timeTo: "now",
    refreshInterval: { pause: false, value: 5000 },
    kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: "", language: "kuery" }, filter: [] }) },
  },
  references: refs,
});

console.log("dashboard created:", dash.id);
console.log(`Open: ${KB.replace("localhost", "172.30.1.96")}/app/dashboards#/view/gps-dashboard`);
