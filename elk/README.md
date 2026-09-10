# ELK for GPS Sensor Logger

Run Elasticsearch + Kibana on Windows (no Docker) and visualize the phone logs on a
**map (geo_point)** and **time-series charts** in Kibana.

Install root: `C:\elk\`
```
C:\elk\
├── elasticsearch-9.4.2\
├── kibana-9.4.2\
├── logstash-9.4.2\
└── ingest\            # (optional) drop *.json logs here for the Logstash pipeline
```
This folder (`elk/` in the repo) holds the integration tooling:
- `index-template.json` — ES mapping (lat/lon → `geo_point`)
- `ingest.mjs` — Node bulk loader (recommended ingest path)
- `logstash/gpssensor.conf` — Logstash pipeline (the "L" option)

Security is configured **OFF** for local dev (plain HTTP, no passwords). Do **not**
expose these ports off your machine.

---

## 1. Start Elasticsearch

```powershell
C:\elk\elasticsearch-9.4.2\bin\elasticsearch.bat
```
Wait until it logs `started`. Verify in another terminal:
```powershell
curl http://localhost:9200
```
You should get a JSON banner with a version number. Leave this window running.

## 2. Start Kibana

```powershell
C:\elk\kibana-9.4.2\bin\kibana.bat
```
First start takes a minute or two (it optimizes bundles). Then open:
```
http://localhost:5601
```

---

## 3a. Real-time streaming from the phone (live map)

The app can stream each sample to Elasticsearch as it's recorded, so an admin watches
devices move on a Kibana map live. One-time setup on this PC:

1. **ES is already bound to the LAN** (`network.host: 0.0.0.0` in `elasticsearch.yml`)
   and reachable at **`http://172.30.1.96:9200`** (this machine's Wi-Fi IP — re-check with
   `ipconfig` if it changes).
2. **Open the Windows Firewall** for port 9200 (needs an **admin** PowerShell — this step
   could not be done automatically):
   ```powershell
   New-NetFirewallRule -DisplayName "Elasticsearch 9200" -Direction Inbound -Protocol TCP -LocalPort 9200 -Action Allow
   ```
3. **Install the index template once** so `location` maps to `geo_point`:
   ```powershell
   node C:\proj\m_gpssensor\elk\ingest.mjs --setup-only
   ```

On the **phone** (same Wi-Fi), in the app's *Device & streaming* card:
- set **Device name** (e.g. "Taeyang Pixel") — this labels the data on the map,
- set **ELK URL** to `http://172.30.1.96:9200`,
- turn on **Stream to ELK in real-time**, then tap **Start**.

The status card shows `ELK: sent N`. Documents land in `gpssensor-logs` with a real
`@timestamp`, `location`, and `device_id` / `device_name`. (Streaming is best-effort; the
on-phone `.json` log is still the complete record for later file ingest.)

> Security is OFF, so anyone on the LAN can write to ES. Fine for a trusted network / MVP;
> do not use on untrusted Wi-Fi.

## 3b. Live map in Kibana (admin)

1. Create the data view (see *Create the data view in Kibana* below) on `gpssensor-*`.
2. **☰ → Maps → Add layer → Documents → `gpssensor`**.
3. Top-right **time picker → Last 15 minutes**, and set **auto-refresh** to ~5s.
4. As the phone streams, points appear and advance in real time. Add a **filter** or
   **Term join** on `device_name` to track a specific device, or color the layer by
   `device_name` to see multiple devices at once.

---

## 3. Ingest a log from a file (recommended: Node)

From the repo's `elk/` folder, point it at a `.json` log exported from the phone
(or the web app's `web/public/sample-log.json`):

```powershell
cd C:\proj\m_gpssensor\elk
node ingest.mjs C:\path\to\session_20260601_143000.json
```

This installs the index template and bulk-loads every sample into the `gpssensor-logs`
index, with a real `@timestamp` and a `location` geo_point.

> Alternative — Logstash: first `node ingest.mjs --setup-only` (to map geo_point),
> then drop logs into `C:\elk\ingest\` and run
> `C:\elk\logstash-9.4.2\bin\logstash.bat -f C:\proj\m_gpssensor\elk\logstash\gpssensor.conf`.

---

## 4. Create the data view in Kibana

1. Kibana → **☰ → Stack Management → Data Views → Create data view**.
2. Name: `gpssensor`, Index pattern: `gpssensor-*`, Timestamp field: `@timestamp`. Save.
3. Open **☰ → Discover**, pick the `gpssensor` data view. Set the time range to cover
   your recording (e.g. *Last 1 year* for the sample) — you should see the documents.

## 5. Map (location)

1. **☰ → Maps → Create map**.
2. **Add layer → Documents → Data view: `gpssensor`**.
3. The track points render on the map (color/size them by a field if you like, e.g.
   size by `gps_accuracy`). Use the time slider to scrub through the session.

## 6. Time-series charts (accel / gyro / mag)

1. **☰ → Dashboard → Create → Create visualization (Lens)**.
2. Chart type **Line**. Horizontal axis = `@timestamp`.
3. Vertical axis: add `ax`, `ay`, `az` (use **Average** or **Max**, with a small bucket
   interval). That's your accelerometer chart.
4. Repeat for `gx,gy,gz` (gyro) and `mx,my,mz` (mag); add all three plus the Map panel to
   one dashboard for the linked map + time-series view.

---

## Document shape

Each sample becomes one document:
```jsonc
{
  "@timestamp": "2026-06-01T05:30:00.000Z",
  "session_id": "session_20260601_143000",
  "device": "Google Pixel 7 / Android 14",
  "interval_ms": 200,
  "t_ms": 0,
  "location": { "lat": 37.5665, "lon": 126.978 },  // omitted if no GPS fix
  "alt": 40.0, "gps_accuracy": 5.0,
  "ax": 0.0, "ay": 0.0, "az": 9.81,
  "gx": 0.0, "gy": 0.0, "gz": 0.0,
  "mx": 25.0, "my": -8.0, "mz": -42.0
}
```

## Stopping

Close the Elasticsearch/Kibana terminal windows (Ctrl+C). To remove everything, delete
`C:\elk\`. To wipe just the data: `curl -X DELETE http://localhost:9200/gpssensor-logs`.
