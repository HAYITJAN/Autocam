import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, ZoomControl } from "react-leaflet";
import { Link } from "react-router-dom";

import { CameraStatusBadge } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraStatus, HeatPoint, MapCamera, MapDistrict } from "@/lib/types";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || "&copy; OpenStreetMap contributors";
const SATELLITE_URL = import.meta.env.VITE_MAP_SATELLITE_URL || `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
const SATELLITE_ATTRIBUTION = import.meta.env.VITE_MAP_SATELLITE_ATTRIBUTION || "Tiles &copy; Esri, Maxar, Earthstar Geographics";
/** Comma-separated overlay tile URLs (place names, roads) drawn on top of the imagery. */
const SATELLITE_LABELS = (
  import.meta.env.VITE_MAP_SATELLITE_LABELS_URL || `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const TASHKENT: [number, number] = [41.3111, 69.2797];

export type Basemap = "street" | "satellite";

export const STATUS_COLORS: Record<CameraStatus, string> = {
  ONLINE: "#5ccb3a",
  WARNING: "#f59e0b",
  OFFLINE: "#f43f5e",
  MAINTENANCE: "#8a8a87",
};

/** A point the map should fly to; change `key` to fly again to the same place. */
export interface MapFocus {
  key: string;
  lat: number;
  lng: number;
  zoom?: number;
}

interface Props {
  cameras?: MapCamera[];
  heat?: HeatPoint[];
  districts?: MapDistrict[];
  height?: number | string;
  zoom?: number;
  selectedId?: number | null;
  onCameraClick?: (id: number) => void;
  onDistrictClick?: (district: MapDistrict) => void;
  focus?: MapFocus | null;
  basemap?: Basemap;
  rounded?: boolean;
}

function FlyTo({ focus }: { focus: MapFocus | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [focus, map]);
  return null;
}

/** Leaflet measures its container once; re-measure when the surrounding layout changes size. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export function CameraMap({
  cameras = [],
  heat = [],
  districts = [],
  height = 320,
  zoom = 11,
  selectedId,
  onCameraClick,
  onDistrictClick,
  focus,
  basemap = "street",
  rounded = true,
}: Props) {
  const maxHeat = Math.max(1, ...heat.map((point) => point.weight));
  const maxDistrict = Math.max(1, ...districts.map((district) => district.violations));
  const satellite = basemap === "satellite";
  const outline = satellite ? "#ffffff" : "#121212";

  return (
    <div className={rounded ? "overflow-hidden rounded-[1.1rem]" : "overflow-hidden"} style={{ height }}>
      <MapContainer center={TASHKENT} zoom={zoom} maxZoom={19} scrollWheelZoom zoomControl={false} className="h-full w-full">
        {satellite ? (
          <>
            <TileLayer key="satellite" url={SATELLITE_URL} attribution={SATELLITE_ATTRIBUTION} maxZoom={19} />
            {SATELLITE_LABELS.map((url) => (
              <TileLayer key={url} url={url} maxZoom={19} />
            ))}
          </>
        ) : (
          <TileLayer key="street" url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
        )}
        <ZoomControl position="bottomright" />
        <FlyTo focus={focus} />
        <AutoResize />

        {districts.map((district) => (
          <CircleMarker
            key={`d-${district.id}`}
            center={[district.center_lat, district.center_lng]}
            radius={14 + (district.violations / maxDistrict) * 26}
            pathOptions={{ color: outline, weight: satellite ? 1.5 : 1, dashArray: "4 4", fillColor: outline, fillOpacity: satellite ? 0.12 : 0.06 }}
            eventHandlers={onDistrictClick ? { click: () => onDistrictClick(district) } : undefined}
          >
            <Tooltip direction="top">
              <b>{district.name}</b>
              <br />
              {t("nav.violations")}: {formatNumber(district.violations)} · {t("nav.cameras")}: {district.cameras}
            </Tooltip>
          </CircleMarker>
        ))}

        {heat.map((point) => (
          <CircleMarker
            key={`h-${point.latitude}-${point.longitude}`}
            center={[point.latitude, point.longitude]}
            radius={6 + (point.weight / maxHeat) * 22}
            pathOptions={{ stroke: false, color: "#f43f5e", fillOpacity: (satellite ? 0.25 : 0.15) + (point.weight / maxHeat) * 0.45 }}
            interactive={false}
          />
        ))}

        {cameras.map((camera) => {
          const active = camera.id === selectedId;
          return (
            <CircleMarker
              key={`c-${camera.id}-${active ? "on" : "off"}`}
              center={[camera.latitude, camera.longitude]}
              radius={active ? 11 : 7}
              pathOptions={{
                color: active ? outline : "#fff",
                weight: active ? 3 : 2,
                fillColor: STATUS_COLORS[camera.status],
                fillOpacity: 1,
              }}
              eventHandlers={onCameraClick ? { click: () => onCameraClick(camera.id) } : undefined}
            >
              {onCameraClick ? (
                <Tooltip direction="top" offset={[0, -8]}>
                  <b>{camera.code}</b> · {camera.location_name}
                  <br />
                  {t("camera.violationsToday")}: <b>{camera.violations_today}</b>
                </Tooltip>
              ) : (
                <Popup>
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold">
                      {camera.code} · {camera.name}
                    </div>
                    <div className="text-mute">
                      {camera.location_name}, {camera.district_name}
                    </div>
                    <CameraStatusBadge status={camera.status} />
                    <div>
                      {t("camera.violationsToday")}: <b>{camera.violations_today}</b>
                    </div>
                    <Link to={`/cameras/${camera.id}`} className="font-semibold text-ink underline">
                      {t("common.view")}
                    </Link>
                  </div>
                </Popup>
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-mute">
      {(Object.keys(STATUS_COLORS) as CameraStatus[]).map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
          {t(`camera.status.${status}`)}
        </span>
      ))}
    </div>
  );
}
