import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { Sample } from "../types";

interface Props {
  samples: Sample[];
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
}

interface Located {
  i: number;
  lat: number;
  lon: number;
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] });
  }, [bounds, map]);
  return null;
}

export default function MapView({ samples, hoverIndex, onHover }: Props) {
  const located = useMemo<Located[]>(
    () =>
      samples
        .map((s, i) => ({ i, lat: s.lat, lon: s.lon }))
        .filter((s): s is Located => s.lat != null && s.lon != null),
    [samples]
  );

  const path = useMemo<LatLngExpression[]>(() => located.map((l) => [l.lat, l.lon]), [located]);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (located.length === 0) return null;
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    for (const l of located) {
      minLat = Math.min(minLat, l.lat); maxLat = Math.max(maxLat, l.lat);
      minLon = Math.min(minLon, l.lon); maxLon = Math.max(maxLon, l.lon);
    }
    return [[minLat, minLon], [maxLat, maxLon]];
  }, [located]);

  const nearest = (lat: number, lon: number): number => {
    let best = located[0].i, bestD = Infinity;
    for (const l of located) {
      const d = (l.lat - lat) ** 2 + (l.lon - lon) ** 2;
      if (d < bestD) { bestD = d; best = l.i; }
    }
    return best;
  };

  if (located.length === 0) {
    return (
      <div className="panel">
        <p className="chart-title">Track</p>
        <p className="muted small">No GPS fixes in this log — the charts below are time-only.</p>
      </div>
    );
  }

  const center: LatLngExpression = [located[0].lat, located[0].lon];
  const hoverPt =
    hoverIndex != null && samples[hoverIndex]?.lat != null && samples[hoverIndex]?.lon != null
      ? ([samples[hoverIndex].lat as number, samples[hoverIndex].lon as number] as LatLngExpression)
      : null;
  const start = path[0];
  const end = path[path.length - 1];

  return (
    <div className="panel">
      <p className="chart-title">Track <span className="muted small">(hover to scrub charts)</span></p>
      <div className="map">
        <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds bounds={bounds} />
          <Polyline
            positions={path}
            pathOptions={{ color: "#2f81f7", weight: 4, opacity: 0.85 }}
            eventHandlers={{
              mousemove: (e) => onHover(nearest(e.latlng.lat, e.latlng.lng)),
              mouseout: () => onHover(null),
            }}
          />
          <CircleMarker center={start} radius={6} pathOptions={{ color: "#3fb950", fillColor: "#3fb950", fillOpacity: 1 }}>
            <Tooltip>Start</Tooltip>
          </CircleMarker>
          <CircleMarker center={end} radius={6} pathOptions={{ color: "#f85149", fillColor: "#f85149", fillOpacity: 1 }}>
            <Tooltip>End</Tooltip>
          </CircleMarker>
          {hoverPt && (
            <CircleMarker center={hoverPt} radius={8} pathOptions={{ color: "#f0b429", fillColor: "#f0b429", fillOpacity: 0.9 }} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
