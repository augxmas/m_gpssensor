export interface Sample {
  t: number; // ms since session start
  lat: number | null;
  lon: number | null;
  alt: number | null;
  acc: number | null;
  ax: number; ay: number; az: number; // accelerometer m/s^2
  gx: number; gy: number; gz: number; // gyroscope rad/s
  mx: number; my: number; mz: number; // magnetic field uT
}

export interface SessionMeta {
  id: string;
  startedAt: number;
  intervalMs: number;
  device: string;
  sampleCount: number;
  durationMs: number;
}

export interface LogFile {
  format: string;
  version: number;
  session: SessionMeta;
  samples: Sample[];
}
