import type { LogFile, Sample, SessionMeta } from "./types";

/** Parse either the app's JSON log or a CSV export into a normalized LogFile. */
export function parseLog(filename: string, text: string): LogFile {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return parseJson(trimmed, filename);
  return parseCsv(trimmed, filename);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function reqNum(v: unknown): number {
  return num(v) ?? 0;
}

function parseJson(text: string, filename: string): LogFile {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw.samples)) {
    throw new Error("JSON does not look like a gpssensor log (missing 'samples').");
  }
  const samples: Sample[] = raw.samples.map((s: Record<string, unknown>) => ({
    t: reqNum(s.t),
    lat: num(s.lat), lon: num(s.lon), alt: num(s.alt), acc: num(s.acc),
    ax: reqNum(s.ax), ay: reqNum(s.ay), az: reqNum(s.az),
    gx: reqNum(s.gx), gy: reqNum(s.gy), gz: reqNum(s.gz),
    mx: reqNum(s.mx), my: reqNum(s.my), mz: reqNum(s.mz),
  }));
  const session: SessionMeta = {
    id: raw.session?.id ?? filename,
    startedAt: reqNum(raw.session?.startedAt),
    intervalMs: reqNum(raw.session?.intervalMs),
    device: raw.session?.device ?? "unknown",
    sampleCount: raw.session?.sampleCount ?? samples.length,
    durationMs: raw.session?.durationMs ?? (samples.at(-1)?.t ?? 0),
  };
  return { format: raw.format ?? "gpssensor-log", version: raw.version ?? 1, session, samples };
}

function parseCsv(text: string, filename: string): LogFile {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const c = {
    t: idx("t_ms"), lat: idx("lat"), lon: idx("lon"), alt: idx("alt"), acc: idx("acc"),
    ax: idx("ax"), ay: idx("ay"), az: idx("az"),
    gx: idx("gx"), gy: idx("gy"), gz: idx("gz"),
    mx: idx("mx"), my: idx("my"), mz: idx("mz"),
  };
  const samples: Sample[] = lines.slice(1).map((line) => {
    const f = line.split(",");
    return {
      t: reqNum(f[c.t]),
      lat: num(f[c.lat]), lon: num(f[c.lon]), alt: num(f[c.alt]), acc: num(f[c.acc]),
      ax: reqNum(f[c.ax]), ay: reqNum(f[c.ay]), az: reqNum(f[c.az]),
      gx: reqNum(f[c.gx]), gy: reqNum(f[c.gy]), gz: reqNum(f[c.gz]),
      mx: reqNum(f[c.mx]), my: reqNum(f[c.my]), mz: reqNum(f[c.mz]),
    };
  });
  const session: SessionMeta = {
    id: filename.replace(/\.csv$/i, ""),
    startedAt: 0,
    intervalMs: samples.length > 1 ? samples[1].t - samples[0].t : 0,
    device: "unknown (CSV)",
    sampleCount: samples.length,
    durationMs: samples.at(-1)?.t ?? 0,
  };
  return { format: "gpssensor-log", version: 1, session, samples };
}
