import "leaflet/dist/leaflet.css";

import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import { Link } from "react-router-dom";

import { CameraStatusBadge } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraStatus, HeatPoint, MapCamera, MapDistrict } from "@/lib/types";

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || "&copy; OpenStreetMap contributors";
const TASHKENT: [number, number] = [41.3111, 69.2797];

export const STATUS_COLORS: Record<CameraStatus, string> = {
  ONLINE: "#5ccb3a",
  WARNING: "#f59e0b",
  OFFLINE: "#f43f5e",
  MAINTENANCE: "#8a8a87",
};

interface Props {
  cameras?: MapCamera[];
  heat?: HeatPoint[];
  districts?: MapDistrict[];
  height?: number | string;
  zoom?: number;
  selectedId?: number | null;
  onCameraClick?: (id: number) => void;
}

export function CameraMap({ cameras = [], heat = [], districts = [], height = 320, zoom = 11, selectedId, onCameraClick }: Props) {
  const maxHeat = Math.max(1, ...heat.map((point) => point.weight));
  const maxDistrict = Math.max(1, ...districts.map((district) => district.violations));

  return (
    <div className="overflow-hidden rounded-[1.1rem]" style={{ height }}>
      <MapContainer center={TASHKENT} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />

        {districts.map((district) => (
          <CircleMarker
            key={`d-${district.id}`}
            center={[district.center_lat, district.center_lng]}
            radius={14 + (district.violations / maxDistrict) * 26}
            pathOptions={{ color: "#121212", weight: 1, fillOpacity: 0.08 }}
          >
            <Tooltip>
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
            pathOptions={{ stroke: false, color: "#f43f5e", fillOpacity: 0.15 + (point.weight / maxHeat) * 0.45 }}
          >
            <Tooltip>
              {point.location_name}: {formatNumber(point.weight)}
            </Tooltip>
          </CircleMarker>
        ))}

        {cameras.map((camera) => (
          <CircleMarker
            key={`c-${camera.id}`}
            center={[camera.latitude, camera.longitude]}
            radius={camera.id === selectedId ? 11 : 7}
            pathOptions={{
              color: camera.id === selectedId ? "#121212" : "#fff",
              weight: camera.id === selectedId ? 3 : 2,
              fillColor: STATUS_COLORS[camera.status],
              fillOpacity: 1,
            }}
            eventHandlers={onCameraClick ? { click: () => onCameraClick(camera.id) } : undefined}
          >
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
          </CircleMarker>
        ))}
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
