import { useMemo } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Sample } from "../types";

interface Props {
  title: string;
  unit: string;
  samples: Sample[];
  keys: [keyof Sample, keyof Sample, keyof Sample];
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
}

const COLORS = ["#2f81f7", "#3fb950", "#f0883e"];
const AXIS = ["x", "y", "z"];

export default function SensorChart({ title, unit, samples, keys, hoverIndex, onHover }: Props) {
  const hoverT = hoverIndex != null && samples[hoverIndex] ? samples[hoverIndex].t : null;

  // Recharts struggles past ~4k points; downsample for rendering but keep index mapping.
  const data = useMemo(() => {
    const max = 3000;
    if (samples.length <= max) return samples.map((s, i) => ({ ...s, __i: i }));
    const step = Math.ceil(samples.length / max);
    const out: (Sample & { __i: number })[] = [];
    for (let i = 0; i < samples.length; i += step) out.push({ ...samples[i], __i: i });
    return out;
  }, [samples]);

  return (
    <div className="panel">
      <p className="chart-title">{title} <span className="muted small">({unit})</span></p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={data}
          syncId="sensors"
          margin={{ top: 4, right: 12, bottom: 4, left: -8 }}
          onMouseMove={(state: any) => {
            const p = state?.activePayload?.[0]?.payload;
            if (p && typeof p.__i === "number") onHover(p.__i);
          }}
          onMouseLeave={() => onHover(null)}
        >
          <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
          <XAxis
            dataKey="t" type="number" domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => (t / 1000).toFixed(0) + "s"}
            stroke="#9aa3b2" fontSize={11}
          />
          <YAxis stroke="#9aa3b2" fontSize={11} width={48} />
          <Tooltip
            contentStyle={{ background: "#1a1d24", border: "1px solid #2a2f3a", borderRadius: 8 }}
            labelFormatter={(t) => `t = ${(Number(t) / 1000).toFixed(2)} s`}
            isAnimationActive={false}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k, i) => (
            <Line
              key={String(k)} dataKey={String(k)} name={AXIS[i]}
              stroke={COLORS[i]} dot={false} isAnimationActive={false} strokeWidth={1.3}
            />
          ))}
          {hoverT != null && <ReferenceLine x={hoverT} stroke="#f0b429" strokeWidth={1} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
