// Creates a Kibana "Map" saved object with a base map + a documents layer on the
// gpssensor data view (geo_point field `location`), so it can be opened by a direct
// link. Run:  node make-map.mjs [--kb http://localhost:5601]
const args = process.argv.slice(2);
const getOpt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const KB = getOpt("kb", "http://localhost:5601").replace(/\/$/, "");
const MAP_ID = "gps-live-map";
const DV_REF = "layer_1_source_index_pattern";

const layerList = [
  {
    id: "basemap",
    type: "EMS_VECTOR_TILE",
    sourceDescriptor: { type: "EMS_TMS", isAutoSelect: true },
    alpha: 1,
    visible: true,
    style: { type: "TILE" },
  },
  {
    id: "gpspoints",
    label: "GPS points",
    type: "MVT_VECTOR",
    sourceDescriptor: {
      type: "ES_SEARCH",
      id: "gpspoints",
      indexPatternRefName: DV_REF,
      geoField: "location",
      filterByMapBounds: true,
      scalingType: "MVT",
      sortField: "@timestamp",
      sortOrder: "desc",
      tooltipProperties: ["device_name", "session_id", "@timestamp", "ax", "ay", "az"],
      applyGlobalQuery: true,
      applyGlobalTime: true,
      applyForceRefresh: true,
    },
    alpha: 0.9,
    visible: true,
    style: {
      type: "VECTOR",
      properties: {
        fillColor: { type: "STATIC", options: { color: "#2f81f7" } },
        lineColor: { type: "STATIC", options: { color: "#0b3d91" } },
        lineWidth: { type: "STATIC", options: { size: 1 } },
        iconSize: { type: "STATIC", options: { size: 6 } },
      },
    },
  },
];

const mapState = {
  zoom: 11,
  center: { lon: 126.95, lat: 37.55 },
  timeFilters: { from: "now-1h", to: "now" },
  refreshConfig: { isPaused: false, interval: 5000 },
  query: { query: "", language: "kuery" },
  filters: [],
  settings: { autoFitToDataBounds: true },
};

const body = {
  attributes: {
    title: "GPS Sensor Live Map",
    description: "Live device positions from gpssensor-*",
    mapStateJSON: JSON.stringify(mapState),
    layerListJSON: JSON.stringify(layerList),
    uiStateJSON: "{}",
  },
  references: [{ name: DV_REF, type: "index-pattern", id: "gpssensor" }],
};

const res = await fetch(`${KB}/api/saved_objects/map/${MAP_ID}?overwrite=true`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "kbn-xsrf": "true" },
  body: JSON.stringify(body),
});
const json = await res.json();
if (!res.ok) {
  console.error("FAILED:", res.status, JSON.stringify(json));
  process.exit(1);
}
console.log("Map saved object created:", json.id);
console.log(`Open it: ${KB.replace("localhost", "172.30.1.96")}/app/maps/map/${MAP_ID}`);
