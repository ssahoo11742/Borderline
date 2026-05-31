import { useEffect, useState, useMemo, useRef } from "react";
import { GeoJSON, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { TYPE_COLORS } from "./mapUtils";

function PaneFader({ opacity }) {
  const map = useMap();
  useEffect(() => {
    const pane = map.getPane("overlayPane");
    if (pane) {
      pane.style.transition = "opacity 0.5s ease";
      pane.style.opacity = String(opacity);
    }
  }, [map, opacity]);
  return null;
}

function PaneSetup() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane("markerPane2")) {
      const p = map.createPane("markerPane2");
      p.style.zIndex = 650;
      p.style.pointerEvents = "auto";
    }
    if (!map.getPane("labelPane")) {
      const p = map.createPane("labelPane");
      p.style.zIndex = 600;
      p.style.pointerEvents = "none";
    }
  }, [map]);
  return null;
}

function ZoomLabels({ groupedLabels, showLabels }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [fading, setFading] = useState(false);
  const timer = useRef(null);

  useMapEvents({
    zoomstart: () => { clearTimeout(timer.current); setFading(true); },
    zoomend: () => {
      setZoom(map.getZoom());
      timer.current = setTimeout(() => setFading(false), 80);
    },
  });

  const visibleLabels = useMemo(() => {
    if (!showLabels) return [];
    return groupedLabels.filter(l => {
      if (l.span >= 25) return zoom >= 2;
      if (l.span >= 12) return zoom >= 2;
      if (l.span >= 6) return zoom >= 3;
      if (l.span >= 2.5) return zoom >= 4;
      return zoom >= 5;
    });
  }, [groupedLabels, showLabels, zoom]);

  const fontSize = zoom <= 2 ? 8 : zoom === 3 ? 9.5 : zoom === 4 ? 11 : 13;

  return (
    <>
      {visibleLabels.map((l, i) => (
        <CircleMarker key={`lbl-${i}`} center={[l.lat, l.lng]} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }} pane="labelPane">
          <Tooltip permanent direction="center" className="region-label" offset={[0, 0]}>
            <span className={`map-label${fading ? " map-label-fade" : ""}`} style={{ fontSize }}>
              {l.label}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export function MapContent({ mergedGeoJSON, groupedLabels, showLabels, showMarkers, markerData, showBorders, colorMode, geoKey, onEachFeature, styleFeature, paneOpacity }) {
  return (
    <>
      <PaneSetup />
      <PaneFader opacity={paneOpacity} />
      {mergedGeoJSON && (
        <GeoJSON key={geoKey} data={mergedGeoJSON} style={styleFeature} onEachFeature={onEachFeature} />
      )}
      <ZoomLabels groupedLabels={groupedLabels} showLabels={showLabels} />
      {showMarkers && markerData?.features?.map((f, i) => {
        const [lng, lat] = f.geometry.coordinates;
        const { name, type, type_label, wiki } = f.properties;
        const color = TYPE_COLORS[type] || TYPE_COLORS.default;
        return (
          <CircleMarker key={`m-${i}`} center={[lat, lng]} radius={4} pane="markerPane2"
            pathOptions={{ fillColor: color, color: "rgba(0,0,0,0.3)", weight: 0.5, fillOpacity: 0.85 }}>
            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
              <div style={{ minWidth: 120, fontFamily: "Georgia, serif" }}>
                <div style={{ fontWeight: "bold", marginBottom: 2 }}>{name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{type_label}</div>
                {wiki && <a href={wiki} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#c9a84c" }}>Wikipedia ↗</a>}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
