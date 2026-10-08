import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { request, requestPage, type QueryParams } from "@/lib/api";
import type {
  AnalyticsOverview,
  CameraDetail,
  CameraListItem,
  CameraPerformance,
  CameraStatistics,
  CameraSummary,
  DashboardKpis,
  DistrictRef,
  Distribution,
  HeatCell,
  HeatPoint,
  HourBucket,
  MapCamera,
  MapDistrict,
  NotificationOut,
  NotificationState,
  RankedItem,
  ReviewOutcomes,
  SystemStatus,
  TimeRange,
  Timeseries,
  UnreadCount,
  UserListItem,
  VehicleDetail,
  VehicleListItem,
  VehicleStatus,
  VehicleSummary,
  VehicleTypeRef,
  ViolationAction,
  ViolationDetail,
  ViolationListItem,
  ViolationStatistics,
  ViolationSummary,
  ViolationTypeDetail,
  ViolationTypeOut,
  ViolationTypeStat,
  ViolatorItem,
} from "@/lib/types";

const LIVE = 30_000;
const REFERENCE = 10 * 60_000;

export interface Period {
  date_from?: string;
  date_to?: string;
}

// ------------------------------------------------------------- dashboard

export const useKpis = () =>
  useQuery({ queryKey: ["dashboard", "kpis"], queryFn: () => request<DashboardKpis>("/dashboard/kpis"), refetchInterval: LIVE });

export const useSystemStatus = () =>
  useQuery({
    queryKey: ["dashboard", "system-status"],
    queryFn: () => request<SystemStatus>("/dashboard/system-status"),
    refetchInterval: LIVE,
  });

export const useViolationsTimeseries = (range: TimeRange) =>
  useQuery({
    queryKey: ["dashboard", "timeseries", range],
    queryFn: () => request<Timeseries>("/dashboard/violations-timeseries", { params: { range } }),
    placeholderData: keepPreviousData,
  });

export const useViolationTypeDistribution = (range: TimeRange) =>
  useQuery({
    queryKey: ["dashboard", "violation-types", range],
    queryFn: () => request<Distribution>("/dashboard/violation-types", { params: { range } }),
    placeholderData: keepPreviousData,
  });

export const useVehicleTypeDistribution = (range: TimeRange) =>
  useQuery({
    queryKey: ["dashboard", "vehicle-types", range],
    queryFn: () => request<Distribution>("/dashboard/vehicle-types", { params: { range } }),
  });

export const useRecentViolations = (limit = 6) =>
  useQuery({
    queryKey: ["dashboard", "recent-violations", limit],
    queryFn: () => request<ViolationListItem[]>("/dashboard/recent-violations", { params: { limit } }),
    refetchInterval: LIVE,
  });

// --------------------------------------------------------------- cameras

export const useCameras = (params: QueryParams) =>
  useQuery({
    queryKey: ["cameras", params],
    queryFn: () => requestPage<CameraListItem>("/cameras", { params }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
  });

export const useCameraSummary = () =>
  useQuery({ queryKey: ["cameras", "summary"], queryFn: () => request<CameraSummary>("/cameras/summary"), refetchInterval: LIVE });

export const useCamera = (id: number) =>
  useQuery({ queryKey: ["camera", id], queryFn: () => request<CameraDetail>(`/cameras/${id}`), refetchInterval: LIVE });

export const useCameraStatistics = (id: number, range: TimeRange) =>
  useQuery({
    queryKey: ["camera", id, "statistics", range],
    queryFn: () => request<CameraStatistics>(`/cameras/${id}/statistics`, { params: { range } }),
    placeholderData: keepPreviousData,
  });

export const useCameraEvents = (id: number) =>
  useQuery({
    queryKey: ["camera", id, "events"],
    queryFn: () => request<ViolationListItem[]>(`/cameras/${id}/events`, { params: { limit: 10 } }),
    refetchInterval: LIVE,
  });

// ------------------------------------------------------------ violations

export const useViolations = (params: QueryParams) =>
  useQuery({
    queryKey: ["violations", params],
    queryFn: () => requestPage<ViolationListItem>("/violations", { params }),
    placeholderData: keepPreviousData,
  });

export const useViolationSummary = () =>
  useQuery({ queryKey: ["violations", "summary"], queryFn: () => request<ViolationSummary>("/violations/summary") });

export const useViolation = (id: number) =>
  useQuery({ queryKey: ["violation", id], queryFn: () => request<ViolationDetail>(`/violations/${id}`) });

/** KPIs, groupings and series for one filter set (same params as `useViolations`). */
export const useViolationStatistics = (params: QueryParams) =>
  useQuery({
    queryKey: ["violations", "statistics", params],
    queryFn: () => request<ViolationStatistics>("/violations/statistics", { params }),
    placeholderData: keepPreviousData,
  });

export const useViolationTypeStats = (params: QueryParams) =>
  useQuery({
    queryKey: ["violations", "types", params],
    queryFn: () => request<ViolationTypeStat[]>("/violations/types", { params }),
    placeholderData: keepPreviousData,
  });

export const useViolationTypeDetail = (typeRef: string, params: QueryParams) =>
  useQuery({
    queryKey: ["violations", "type", typeRef, params],
    queryFn: () => request<ViolationTypeDetail>(`/violations/types/${encodeURIComponent(typeRef)}`, { params }),
    placeholderData: keepPreviousData,
  });

export const useViolators = (params: QueryParams) =>
  useQuery({
    queryKey: ["violations", "vehicles", params],
    queryFn: () => requestPage<ViolatorItem>("/violations/vehicles", { params }),
    placeholderData: keepPreviousData,
  });

interface TransitionInput {
  action: ViolationAction;
  comment?: string;
}

export function useViolationTransition(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, comment }: TransitionInput) => {
      const body = action === "reject" ? { reason: comment ?? "" } : action === "confirm" ? { comment } : undefined;
      return request<ViolationDetail>(`/violations/${id}/${action}`, { method: "POST", body });
    },
    onSuccess: (detail) => {
      client.setQueryData(["violation", id], detail);
      void client.invalidateQueries({ queryKey: ["violations"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useViolationComment(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (comment: string) =>
      request<ViolationDetail>(`/violations/${id}/comments`, { method: "POST", body: { comment } }),
    onSuccess: (detail) => client.setQueryData(["violation", id], detail),
  });
}

// -------------------------------------------------------------- vehicles

export const useVehicles = (params: QueryParams) =>
  useQuery({
    queryKey: ["vehicles", params],
    queryFn: () => requestPage<VehicleListItem>("/vehicles", { params }),
    placeholderData: keepPreviousData,
  });

export const useVehicleSummary = () =>
  useQuery({ queryKey: ["vehicles", "summary"], queryFn: () => request<VehicleSummary>("/vehicles/summary") });

export const useVehicle = (id: number) =>
  useQuery({ queryKey: ["vehicle", id], queryFn: () => request<VehicleDetail>(`/vehicles/${id}`) });

export const useVehicleViolations = (id: number, page: number, pageSize = 10) =>
  useQuery({
    queryKey: ["vehicle", id, "violations", page, pageSize],
    queryFn: () => requestPage<ViolationListItem>(`/vehicles/${id}/violations`, { params: { page, page_size: pageSize } }),
    placeholderData: keepPreviousData,
  });

export function useVehicleStatus(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: VehicleStatus; reason?: string }) =>
      request<VehicleDetail>(`/vehicles/${id}/status`, { method: "POST", body: input }),
    onSuccess: (detail) => {
      client.setQueryData(["vehicle", id], detail);
      void client.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

// ------------------------------------------------------------- analytics

const periodParams = (period: Period): QueryParams => ({ ...period });

export const useAnalyticsOverview = (period: Period) =>
  useQuery({
    queryKey: ["analytics", "overview", period],
    queryFn: () => request<AnalyticsOverview>("/analytics/overview", { params: periodParams(period) }),
  });

export const useByHour = (period: Period) =>
  useQuery({
    queryKey: ["analytics", "by-hour", period],
    queryFn: () => request<HourBucket[]>("/analytics/violations/by-hour", { params: periodParams(period) }),
  });

export const useWeekdayHour = (period: Period) =>
  useQuery({
    queryKey: ["analytics", "by-weekday-hour", period],
    queryFn: () => request<HeatCell[]>("/analytics/violations/by-weekday-hour", { params: periodParams(period) }),
  });

export const useByType = (period: Period) =>
  useQuery({
    queryKey: ["analytics", "by-type", period],
    queryFn: () => request<Distribution>("/analytics/violations/by-type", { params: periodParams(period) }),
  });

export const useByDistrict = (period: Period) =>
  useQuery({
    queryKey: ["analytics", "by-district", period],
    queryFn: () => request<Distribution>("/analytics/violations/by-district", { params: periodParams(period) }),
  });

export const useReviewOutcomes = (period: Period) =>
  useQuery({
    queryKey: ["analytics", "review-outcomes", period],
    queryFn: () => request<ReviewOutcomes>("/analytics/violations/review-outcomes", { params: periodParams(period) }),
  });

export const useCameraPerformance = (period: Period) =>
  useQuery({
    queryKey: ["analytics", "camera-performance", period],
    queryFn: () => request<CameraPerformance[]>("/analytics/cameras/performance", { params: periodParams(period) }),
  });

export const useTop = (kind: "cameras" | "locations" | "vehicles", period: Period, limit = 8) =>
  useQuery({
    queryKey: ["analytics", "top", kind, period, limit],
    queryFn: () => request<RankedItem[]>(`/analytics/top/${kind}`, { params: { ...periodParams(period), limit } }),
  });

export const useDailySeries = (range: TimeRange) =>
  useQuery({
    queryKey: ["analytics", "by-day", range],
    queryFn: () => request<Timeseries>("/analytics/violations/by-day", { params: { range } }),
  });

// ------------------------------------------------------------------- map

export const useMapCameras = () =>
  useQuery({ queryKey: ["map", "cameras"], queryFn: () => request<MapCamera[]>("/map/cameras"), refetchInterval: LIVE });

export const useHeatmap = (period: Period) =>
  useQuery({
    queryKey: ["map", "heatmap", period],
    queryFn: () => request<HeatPoint[]>("/map/heatmap", { params: periodParams(period) }),
  });

export const useMapDistricts = (period: Period) =>
  useQuery({
    queryKey: ["map", "districts", period],
    queryFn: () => request<MapDistrict[]>("/map/districts", { params: periodParams(period) }),
  });

// --------------------------------------------------------- notifications

export const useNotifications = (params: { state?: NotificationState; page: number }) =>
  useQuery({
    queryKey: ["notifications", params],
    queryFn: () => requestPage<NotificationOut>("/notifications", { params: { ...params, page_size: 20 } }),
    placeholderData: keepPreviousData,
  });

export const useUnreadCount = () =>
  useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => request<UnreadCount>("/notifications/unread-count"),
    refetchInterval: LIVE,
  });

export function useNotificationAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "read" | "unread" | "archive" }) =>
      request<void>(`/notifications/${id}/${action}`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useReadAllNotifications() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<unknown>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ------------------------------------------------------------- reference

export const useViolationTypes = () =>
  useQuery({ queryKey: ["ref", "violation-types"], queryFn: () => request<ViolationTypeOut[]>("/violation-types"), staleTime: REFERENCE });

export const useVehicleTypes = () =>
  useQuery({ queryKey: ["ref", "vehicle-types"], queryFn: () => request<VehicleTypeRef[]>("/vehicle-types"), staleTime: REFERENCE });

/** Camera list for filter dropdowns (reference data, no live polling). */
export const useCameraOptions = () =>
  useQuery({
    queryKey: ["ref", "camera-options"],
    queryFn: () => requestPage<CameraListItem>("/cameras", { params: { page_size: 100, sort: "code" } }),
    staleTime: REFERENCE,
  });

export const useDistricts = () =>
  useQuery({ queryKey: ["ref", "districts"], queryFn: () => request<DistrictRef[]>("/districts"), staleTime: REFERENCE });

export const useUsers = (enabled: boolean) =>
  useQuery({ queryKey: ["users"], queryFn: () => request<UserListItem[]>("/users"), enabled });
