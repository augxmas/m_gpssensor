import { useMemo, useState } from "react";
import FileDrop from "./components/FileDrop";
import MapView from "./components/MapView";
import SensorChart from "./components/SensorChart";
import DownloadPage from "./components/DownloadPage";
import { parseLog } from "./parse";
import type { LogFile, Sample } from "./types";

type Tab = "visualize" | "download";

export default function App() {
  const [tab, setTab] = useState<Tab>("visualize");
  const [log, setLog] = useState<LogFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const onFile = (filename: string, text: string) => {
    try {
      const parsed = parseLog(filename, text);
      if (parsed.samples.length === 0) throw new Error("The log contains no samples.");
      setLog(parsed);
      setError(null);
      setHoverIndex(null);
    } catch (e) {
      setLog(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="app">
      <header>
        <h1>📡 GPS Sensor Logger</h1>
        <nav className="tabs">
          <button className={tab === "visualize" ? "active" : ""} onClick={() => setTab("visualize")}>
            Visualize
          </button>
          <button className={tab === "download" ? "active" : ""} onClick={() => setTab("download")}>
            Get the app
          </button>
        </nav>
      </header>

      {tab === "download" ? (
        <DownloadPage />
      ) : (
        <Visualize
          log={log}
          error={error}
          hoverIndex={hoverIndex}
          onHover={setHoverIndex}
          onFile={onFile}
        />
      )}
    </div>
  );
}

function Visualize({
  log, error, hoverIndex, onHover, onFile,
}: {
  log: LogFile | null;
  error: string | null;
  hoverIndex: number | null;
  onHover: (i: number | null) => void;
  onFile: (filename: string, text: string) => void;
}) {
  const hovered: Sample | null = useMemo(
    () => (log && hoverIndex != null ? log.samples[hoverIndex] ?? null : null),
    [log, hoverIndex]
  );

  return (
    <>
      <div className="panel">
        <FileDrop onFile={onFile} />
        {error && <p className="warn small" style={{ marginBottom: 0 }}>⚠ {error}</p>}
      </div>

      {log && (
        <>
          <div className="panel">
            <div className="meta-grid">
              <Meta k="Session" v={log.session.id} />
              <Meta k="Device" v={log.session.device} />
              <Meta k="Samples" v={String(log.session.sampleCount)} />
              <Meta k="Interval" v={`${log.session.intervalMs} ms`} />
              <Meta k="Duration" v={`${(log.session.durationMs / 1000).toFixed(1)} s`} />
              <Meta
                k="Hover"
                v={hovered ? `t=${(hovered.t / 1000).toFixed(2)}s` : "—"}
              />
            </div>
          </div>

          <MapView samples={log.samples} hoverIndex={hoverIndex} onHover={onHover} />

          <SensorChart
            title="Accelerometer" unit="m/s²" samples={log.samples}
            keys={["ax", "ay", "az"]} hoverIndex={hoverIndex} onHover={onHover}
          />
          <SensorChart
            title="Gyroscope" unit="rad/s" samples={log.samples}
            keys={["gx", "gy", "gz"]} hoverIndex={hoverIndex} onHover={onHover}
          />
          <SensorChart
            title="Magnetometer" unit="µT" samples={log.samples}
            keys={["mx", "my", "mz"]} hoverIndex={hoverIndex} onHover={onHover}
          />
        </>
      )}
    </>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
