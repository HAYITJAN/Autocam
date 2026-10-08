// Mirrors backend/app/schemas/*. Keep field names in sync with the API.

export type CameraStatus = "ONLINE" | "OFFLINE" | "WARNING" | "MAINTENANCE";
export type CameraType = "FIXED" | "PTZ" | "ANPR" | "SPEED";
export type ConnectionType = "WIFI" | "LTE_4G" | "ETHERNET";
export type ConnectionStatus = "CONNECTED" | "DEGRADED" | "DISCONNECTED";
export type LocationType = "INTERSECTION" | "STREET" | "HIGHWAY" | "PARKING";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ViolationStatus = "NEW" | "UNDER_REVIEW" | "CONFIRMED" | "REJECTED" | "ARCHIVED";
export type ViolationEventType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "ASSIGNED"
  | "COMMENT"
  | "EXPORTED"
  | "REPORT_GENERATED";
export type ViolationAction = "review" | "confirm" | "reject" | "archive" | "reopen";
export type VehicleStatus = "NORMAL" | "WATCHLIST" | "BLACKLIST";
export type TrafficLightState = "RED" | "YELLOW" | "GREEN" | "UNKNOWN";
export type NotificationType = "CRITICAL" | "WARNING" | "INFO" | "SYSTEM" | "VIOLATION";
export type NotificationState = "UNREAD" | "READ" | "ARCHIVED";
export type UserStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";
export type TimeRange = "24h" | "7d" | "30d";

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

// ---------------------------------------------------------------- auth

export interface UserProfile {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  role_name: string;
  permissions: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  user: UserProfile;
}

// ---------------------------------------------------------- references

export interface DistrictRef {
  id: number;
  code: string;
  name: string;
}

export interface LocationRef {
  id: number;
  name: string;
  location_type: LocationType;
  latitude: number;
  longitude: number;
  district: DistrictRef;
}

export interface ViolationTypeOut {
  id: number;
  code: string;
  name_uz: string;
  name_en: string;
  severity: Severity;
  color: string;
  icon: string | null;
  fine_amount: number | null;
  is_active: boolean;
}

export interface ViolationTypeRef {
  id: number;
  code: string;
  name_uz: string;
  severity: Severity;
  color: string;
}

export interface VehicleTypeRef {
  id: number;
  code: string;
  name_uz: string;
  color: string;
  icon: string | null;
}

export interface UserRef {
  id: number;
  full_name: string;
  username: string;
}

export interface CameraRef {
  id: number;
  code: string;
  name: string;
}

export interface TypeCount {
  code: string;
  name: string;
  color: string | null;
  count: number;
  pct: number;
}

// -------------------------------------------------------------- cameras

export interface CameraMetrics {
  fps: number | null;
  latency_ms: number | null;
  cpu_percent: number | null;
  temperature_c: number | null;
  packet_loss_pct: number | null;
  recorded_at: string | null;
}

export interface CameraListItem {
  id: number;
  code: string;
  name: string;
  status: CameraStatus;
  camera_type: CameraType;
  is_enabled: boolean;
  ai_enabled: boolean;
  location: LocationRef;
  connection_type: ConnectionType | null;
  signal_strength_dbm: number | null;
  last_heartbeat_at: string | null;
  metrics: CameraMetrics;
  violations_today: number;
}

export interface CameraConnectionOut {
  id: number;
  connection_type: ConnectionType;
  is_primary: boolean;
  status: ConnectionStatus;
  operator: string | null;
  ssid_or_apn: string | null;
  ip_address: string | null;
  signal_strength_dbm: number | null;
  bandwidth_mbps: number | null;
}

export interface TrafficZoneOut {
  id: number;
  name: string;
  zone_type: string;
  geometry: Record<string, unknown>;
  config: Record<string, unknown>;
  is_active: boolean;
}

export interface CameraDetail extends CameraListItem {
  ip_address: string | null;
  port: number | null;
  mac_address: string | null;
  rtsp_configured: boolean;
  resolution: string;
  fps_target: number;
  recording_enabled: boolean;
  retention_days: number;
  confidence_threshold: number;
  speed_limit_kmh: number;
  road_direction_deg: number | null;
  installed_at: string | null;
  connections: CameraConnectionOut[];
  zones: TrafficZoneOut[];
  has_traffic_light: boolean;
}

export interface CameraSummary {
  total: number;
  online: number;
  offline: number;
  warning: number;
  maintenance: number;
}

export interface SeriesPoint {
  t: string;
  value: number | null;
}

export interface CameraStatistics {
  range: string;
  violations_total: number;
  violations_series: SeriesPoint[];
  fps_series: SeriesPoint[];
  latency_series: SeriesPoint[];
  uptime_pct: number | null;
  by_type: TypeCount[];
}

// ----------------------------------------------------------- violations

export interface ViolationListItem {
  id: number;
  code: string;
  status: ViolationStatus;
  occurred_at: string;
  plate_number: string | null;
  ai_confidence: number;
  detected_speed: number | null;
  speed_limit: number | null;
  type: ViolationTypeRef;
  camera: CameraRef;
  location_name: string | null;
  district_name: string | null;
  vehicle_type: VehicleTypeRef | null;
  assigned_to: UserRef | null;
}

export interface ViolationEventOut {
  id: number;
  event_type: ViolationEventType;
  from_status: ViolationStatus | null;
  to_status: ViolationStatus | null;
  actor: UserRef | null;
  comment: string | null;
  created_at: string;
}

export interface VehicleBrief {
  id: number;
  plate_number: string;
  plate_display: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  status: VehicleStatus;
  total_violations: number;
}

export interface EvidenceOut {
  id: number;
  evidence_type: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  captured_at: string;
}

export interface ViolationDetail extends ViolationListItem {
  excess_speed: number | null;
  direction: string | null;
  traffic_light_state: TrafficLightState | null;
  track_id: string | null;
  reviewed_by: UserRef | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  location: LocationRef | null;
  vehicle: VehicleBrief | null;
  evidence: EvidenceOut[];
  events: ViolationEventOut[];
  allowed_actions: ViolationAction[];
  meta: Record<string, unknown>;
}

export interface ViolationSummary {
  total: number;
  confirmed: number;
  pending: number;
  rejected: number;
  today: number;
  yesterday: number;
  this_week: number;
  this_month: number;
  today_delta_pct: number | null;
}

// ------------------------------------------------------------- vehicles

export interface VehicleListItem {
  id: number;
  plate_number: string;
  plate_display: string;
  vehicle_type: VehicleTypeRef | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  status: VehicleStatus;
  status_reason: string | null;
  total_detections: number;
  total_violations: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_camera: CameraRef | null;
}

export interface VehicleDetail extends VehicleListItem {
  vin: string | null;
  owner_name: string | null;
  notes: string | null;
  violations_by_type: TypeCount[];
}

export interface VehicleSummary {
  total: number;
  active_24h: number;
  with_violations: number;
  blacklisted: number;
  watchlist: number;
  by_type: TypeCount[];
}

// -------------------------------------------------------- notifications

export interface NotificationOut {
  id: number;
  type: NotificationType;
  category: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  state: NotificationState;
  read_at: string | null;
  created_at: string;
}

export interface UnreadCount {
  total: number;
  by_type: Record<string, number>;
}

// ------------------------------------------------------------ dashboard

export interface Kpi {
  value: number;
  delta_pct: number | null;
  secondary: number | null;
  sparkline: number[];
}

export interface DashboardKpis {
  total_vehicles: Kpi;
  active_cameras: Kpi;
  total_cameras: number;
  violations_today: Kpi;
  confirmed_today: Kpi;
  pending_today: Kpi;
  uptime_pct: Kpi;
  generated_at: string;
}

export interface NamedSeries {
  code: string;
  name: string;
  color: string | null;
  values: number[];
}

export interface Timeseries {
  range: string;
  bucket: string;
  buckets: string[];
  series: NamedSeries[];
  totals: number[];
}

export interface Distribution {
  range: string;
  total: number;
  items: TypeCount[];
}

export interface ComponentHealth {
  name: string;
  state: "up" | "down";
  critical: boolean;
  latency_ms: number | null;
  detail: string | null;
}

export interface SystemStatus {
  components: ComponentHealth[];
  cameras_online: number;
  cameras_total: number;
  server_time: string;
}

// ------------------------------------------------------------ analytics

export interface AnalyticsOverview {
  date_from: string;
  date_to: string;
  total: number;
  confirmed: number;
  rejected: number;
  pending: number;
  archived: number;
  avg_per_day: number;
  accuracy_pct: number | null;
  total_delta_pct: number | null;
  vehicles_involved: number;
  top_type: TypeCount | null;
}

export interface HourBucket {
  hour: number;
  count: number;
}

export interface HeatCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface RankedItem {
  id: number;
  label: string;
  sublabel: string | null;
  count: number;
}

export interface CameraPerformance {
  id: number;
  code: string;
  name: string;
  status: CameraStatus;
  uptime_pct: number | null;
  avg_fps: number | null;
  avg_latency_ms: number | null;
  violations: number;
  confirmed: number;
  rejected: number;
}

export interface ReviewOutcomeDay {
  day: string;
  confirmed: number;
  rejected: number;
}

export interface ReviewOutcomes {
  days: ReviewOutcomeDay[];
  rejection_reasons: TypeCount[];
  accuracy_by_type: TypeCount[];
}

// ------------------------------------------------------------------ map

export interface MapCamera {
  id: number;
  code: string;
  name: string;
  status: CameraStatus;
  latitude: number;
  longitude: number;
  location_name: string;
  district_name: string;
  violations_today: number;
}

export interface HeatPoint {
  latitude: number;
  longitude: number;
  weight: number;
  location_name: string;
}

export interface MapDistrict {
  id: number;
  code: string;
  name: string;
  center_lat: number;
  center_lng: number;
  violations: number;
  cameras: number;
}

export interface UserListItem {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  role_name: string;
  status: UserStatus;
}
