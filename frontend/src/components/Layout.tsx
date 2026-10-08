import {
  BarChart3,
  Bell,
  Camera,
  Car,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MonitorPlay,
  Search,
  Settings,
  ShieldAlert,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useSystemStatus, useUnreadCount } from "@/api/queries";
import { logout } from "@/lib/api";
import { cn, DISPLAY_TZ } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { useAuthStore, useHasPermission } from "@/stores/auth";

interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "nav.dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { to: "/monitoring", label: "nav.monitoring", icon: MonitorPlay, permission: "monitoring.view" },
  { to: "/cameras", label: "nav.cameras", icon: Camera, permission: "cameras.view" },
  { to: "/violations", label: "nav.violations", icon: ShieldAlert, permission: "violations.view" },
  { to: "/vehicles", label: "nav.vehicles", icon: Car, permission: "vehicles.view" },
  { to: "/map", label: "nav.map", icon: Map, permission: "monitoring.view" },
  { to: "/analytics", label: "nav.analytics", icon: BarChart3, permission: "analytics.view" },
  { to: "/reports", label: "nav.reports", icon: FileText, permission: "reports.view" },
  { to: "/notifications", label: "nav.notifications", icon: Bell },
  { to: "/users", label: "nav.users", icon: Users, permission: "users.view" },
  { to: "/settings", label: "nav.settings", icon: Settings, permission: "settings.view" },
];

const MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];
const WEEKDAYS: Record<string, string> = {
  Mon: "Dushanba",
  Tue: "Seshanba",
  Wed: "Chorshanba",
  Thu: "Payshanba",
  Fri: "Juma",
  Sat: "Shanba",
  Sun: "Yakshanba",
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Clock() {
  const now = useNow();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TZ,
      day: "numeric",
      month: "numeric",
      year: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const month = MONTHS[Number(parts.month) - 1] ?? "";
  return (
    <div className="hidden text-right leading-tight md:block">
      <div className="text-xs text-slate-500">
        {parts.day} {month} {parts.year}, {WEEKDAYS[parts.weekday ?? ""] ?? ""}
      </div>
      <div className="font-mono text-lg font-bold tracking-tight text-slate-900">
        {parts.hour}:{parts.minute}:{parts.second}
      </div>
    </div>
  );
}

function initials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name, size = "md" }: { name: string | undefined; size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 font-semibold text-white",
        size === "md" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs",
      )}
    >
      {initials(name)}
    </div>
  );
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean | null; value?: string }) {
  return (
    <li className="flex items-center justify-between text-[13px]">
      <span className="flex items-center gap-2 text-slate-600">
        <span className={cn("h-2 w-2 rounded-full", ok === null ? "bg-slate-300" : ok ? "bg-emerald-500" : "bg-red-500")} />
        {label}
      </span>
      <span className={cn("font-medium", ok === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-red-600")}>
        {value ?? (ok === null ? "—" : ok ? "Online" : "Offline")}
      </span>
    </li>
  );
}

function SystemStatusBox() {
  const status = useSystemStatus();
  const component = (name: string) => {
    const found = status.data?.components.find((item) => item.name === name);
    return found ? found.state === "up" : null;
  };
  const allUp = status.data ? status.data.components.every((item) => item.state === "up" || !item.critical) : null;
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-800">Tizim holati</span>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", allUp ? "text-emerald-600" : "text-amber-600")}>
          <span className={cn("h-2 w-2 rounded-full", allUp ? "bg-emerald-500" : "bg-amber-500")} />
          {allUp ? "Online" : "Qisman"}
        </span>
      </div>
      <ul className="space-y-1.5">
        <StatusRow label="Server" ok={status.isError ? false : status.data ? true : null} />
        <StatusRow label="AI modul" ok={component("ai_service")} />
        <StatusRow label="Ma’lumotlar bazasi" ok={component("database")} />
        <StatusRow
          label="Kameralar"
          ok={status.data ? status.data.cameras_online > 0 : null}
          value={status.data ? `${status.data.cameras_online} / ${status.data.cameras_total}` : undefined}
        />
      </ul>
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const canSeeStatus = useHasPermission("dashboard.view");
  const unread = useUnreadCount();
  const navigate = useNavigate();
  const items = NAV_ITEMS.filter((item) => !item.permission || permissions.includes(item.permission));
  const unreadTotal = unread.data?.total ?? 0;

  return (
    <>
      <div className={cn("fixed inset-0 z-30 bg-slate-900/40 lg:hidden", open ? "block" : "hidden")} onClick={onClose} aria-hidden />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-slate-200/70 bg-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[72px] items-center justify-between gap-2 px-5">
          <Link to="/" className="flex items-center gap-3" onClick={onClose}>
            <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl shadow-sm" />
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-wide text-slate-900">{t("app.name")}</div>
              <div className="text-xs text-slate-500">Yo‘l harakati nazorati</div>
            </div>
          </Link>
          <button type="button" className="lg:hidden" onClick={onClose} aria-label="close">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition",
                  isActive ? "bg-brand-600 text-white shadow-md shadow-brand-600/25" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )
              }
            >
              <item.icon className="h-[19px] w-[19px]" />
              <span className="flex-1">{t(item.label)}</span>
              {item.to === "/notifications" && unreadTotal > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                  {Math.min(unreadTotal, 99)}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-3">
          {canSeeStatus && <SystemStatusBox />}
          <div className="rounded-xl border border-slate-200/70 bg-white p-2.5">
            <div className="flex items-center gap-3">
              <Avatar name={user?.full_name} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-slate-800">{user?.full_name}</div>
                <div className="truncate text-xs text-slate-500">{user?.role_name}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout().finally(() => navigate("/login", { replace: true }))}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              {t("auth.logout")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;
    const target = /^cam-?\d+/i.test(query) ? "/cameras" : "/violations";
    navigate(`${target}?search=${encodeURIComponent(query)}`);
    setValue("");
  };

  return (
    <form onSubmit={submit} className="relative hidden max-w-xl flex-1 sm:block">
      <Search className="pointer-events-none absolute left-3.5 top-2.5 h-[18px] w-[18px] text-slate-400" />
      <input
        ref={input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Qidirish… (kamera, davlat raqami, qoidabuzarlik ID)"
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-10 pr-16 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
      />
      <kbd className="pointer-events-none absolute right-3 top-2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
        Ctrl K
      </kbd>
    </form>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const user = useAuthStore((state) => state.user);
  const unread = useUnreadCount();
  const unreadTotal = unread.data?.total ?? 0;

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur lg:px-6">
      <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="menu">
        <Menu className="h-5 w-5" />
      </button>
      <GlobalSearch />
      <div className="flex-1" />
      <Clock />
      <Link to="/notifications" className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100" aria-label={t("nav.notifications")}>
        <Bell className="h-5 w-5" />
        {unreadTotal > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {Math.min(unreadTotal, 99)}
          </span>
        )}
      </Link>
      <span className="hidden items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-slate-700 sm:flex">
        <span className="h-4 w-4 overflow-hidden rounded-full bg-[linear-gradient(#1eb5e8_0_33%,#fff_33%_66%,#1eb53a_66%)] ring-1 ring-slate-200" />
        Uz
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </span>
      <div className="hidden items-center gap-2.5 border-l border-slate-200 pl-4 sm:flex">
        <Avatar name={user?.full_name} size="sm" />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-800">{user?.full_name}</div>
          <div className="text-xs text-slate-500">{user?.role_name}</div>
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-full">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[260px]">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1680px] p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
