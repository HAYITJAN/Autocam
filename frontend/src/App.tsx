import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { ComingSoon, LoadingBlock, NoPermission } from "@/components/ui";
import { refreshSession } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useAuthStore, useHasPermission } from "@/stores/auth";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const MonitoringPage = lazy(() => import("@/pages/MonitoringPage"));
const CamerasPage = lazy(() => import("@/pages/CamerasPage"));
const CameraDetailPage = lazy(() => import("@/pages/CameraDetailPage"));
const ViolationsPage = lazy(() => import("@/pages/ViolationsPage"));
const ViolationTypesPage = lazy(() => import("@/pages/ViolationTypesPage"));
const ViolationTypePage = lazy(() => import("@/pages/ViolationTypePage"));
const ViolatorsPage = lazy(() => import("@/pages/ViolatorsPage"));
const ViolationCamerasPage = lazy(() => import("@/pages/ViolationCamerasPage"));
const ViolationDetailPage = lazy(() => import("@/pages/ViolationDetailPage"));
const VehiclesPage = lazy(() => import("@/pages/VehiclesPage"));
const VehicleDetailPage = lazy(() => import("@/pages/VehicleDetailPage"));
const MapPage = lazy(() => import("@/pages/MapPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  if (status === "unknown") return <LoadingBlock className="h-screen" />;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function Guard({ permission, children }: { permission: string; children: ReactNode }) {
  return useHasPermission(permission) ? <>{children}</> : <NoPermission />;
}

export function App() {
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    // Restore the session from the HttpOnly refresh cookie on first load.
    if (status === "unknown") void refreshSession();
  }, [status]);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingBlock className="h-screen" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Guard permission="dashboard.view"><DashboardPage /></Guard>} />
            <Route path="monitoring" element={<Guard permission="monitoring.view"><MonitoringPage /></Guard>} />
            <Route path="cameras" element={<Guard permission="cameras.view"><CamerasPage /></Guard>} />
            <Route path="cameras/:id" element={<Guard permission="cameras.view"><CameraDetailPage /></Guard>} />
            <Route path="violations" element={<Guard permission="violations.view"><ViolationsPage /></Guard>} />
            <Route path="violations/types" element={<Guard permission="violations.view"><ViolationTypesPage /></Guard>} />
            <Route path="violations/types/:code" element={<Guard permission="violations.view"><ViolationTypePage /></Guard>} />
            <Route path="violations/vehicles" element={<Guard permission="violations.view"><ViolatorsPage /></Guard>} />
            <Route path="violations/cameras" element={<Guard permission="violations.view"><ViolationCamerasPage /></Guard>} />
            <Route path="violations/:id" element={<Guard permission="violations.view"><ViolationDetailPage /></Guard>} />
            <Route path="vehicles" element={<Guard permission="vehicles.view"><VehiclesPage /></Guard>} />
            <Route path="vehicles/:id" element={<Guard permission="vehicles.view"><VehicleDetailPage /></Guard>} />
            <Route path="map" element={<Guard permission="monitoring.view"><MapPage /></Guard>} />
            <Route path="analytics" element={<Guard permission="analytics.view"><AnalyticsPage /></Guard>} />
            <Route path="reports" element={<ComingSoon title={t("nav.reports")} />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="users" element={<Guard permission="users.view"><UsersPage /></Guard>} />
            <Route path="settings" element={<ComingSoon title={t("nav.settings")} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
