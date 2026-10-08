import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Camera,
  Car,
  ChevronLeft,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MonitorPlay,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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

interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview",
    label: "Boshqaruv",
    icon: LayoutDashboard,
    items: [
      { to: "/", label: "nav.dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
      { to: "/monitoring", label: "nav.monitoring", icon: MonitorPlay, permission: "monitoring.view" },
      { to: "/map", label: "nav.map", icon: Map, permission: "monitoring.view" },
    ],
  },
  {
    key: "control",
    label: "Nazorat",
    icon: ShieldAlert,
    items: [
      { to: "/cameras", label: "nav.cameras", icon: Camera, permission: "cameras.view" },
      { to: "/violations", label: "nav.violations", icon: ShieldAlert, permission: "violations.view" },
      { to: "/vehicles", label: "nav.vehicles", icon: Car, permission: "vehicles.view" },
    ],
  },
  {
    key: "analytics",
    label: "Tahlil",
    icon: BarChart3,
    items: [
      { to: "/analytics", label: "nav.analytics", icon: BarChart3, permission: "analytics.view" },
      { to: "/reports", label: "nav.reports", icon: FileText, permission: "reports.view" },
    ],
  },
  {
    key: "system",
    label: "Tizim",
    icon: Settings,
    items: [
      { to: "/notifications", label: "nav.notifications", icon: Bell },
      { to: "/users", label: "nav.users", icon: Users, permission: "users.view" },
      { to: "/settings", label: "nav.settings", icon: Settings, permission: "settings.view" },
    ],
  },
];

const COLLAPSE_KEY = "st.sidebar.collapsed";

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

function isItemActive(item: NavItem, pathname: string): boolean {
  return item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function useNavGroups() {
  const permissions = useAuthStore((state) => state.user?.permissions) ?? [];
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0);
}

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
    <div className="hidden text-right leading-tight 2xl:block">
      <div className="font-mono text-sm font-semibold tabular-nums text-white">
        {parts.hour}:{parts.minute}:{parts.second}
      </div>
      <div className="text-[11px] text-white/50">
        {parts.day} {month} {parts.year}, {WEEKDAYS[parts.weekday ?? ""] ?? ""}
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

function HeaderIconButton({ label, onClick, to, children }: { label: string; onClick?: () => void; to?: string; children: ReactNode }) {
  const className =
    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-700/80 text-white/80 transition hover:bg-navy-600 hover:text-white";
  if (to) {
    return (
      <Link to={to} className={className} aria-label={label} title={label}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
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
    <form onSubmit={submit} className="relative hidden w-[260px] md:block">
      <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-white/40" />
      <input
        ref={input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Qidirish…"
        title="Kamera kodi, davlat raqami yoki qoidabuzarlik ID"
        className="h-9 w-full rounded-full border border-white/10 bg-white/[0.06] pl-10 pr-14 text-[13px] text-white outline-none transition placeholder:text-white/40 focus:border-brand-400 focus:bg-white/10"
      />
      <kbd className="pointer-events-none absolute right-3 top-2 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/40">
        Ctrl K
      </kbd>
    </form>
  );
}

function TopHeader({ onMenu }: { onMenu: () => void }) {
  const user = useAuthStore((state) => state.user);
  const unread = useUnreadCount();
  const unreadTotal = unread.data?.total ?? 0;
  const queryClient = useQueryClient();
  const groups = useNavGroups();
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-navy-900 px-4 shadow-[0_1px_0_rgba(255,255,255,0.04)] lg:px-5">
      <button type="button" className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 lg:hidden" onClick={onMenu} aria-label="menu">
        <Menu className="h-5 w-5" />
      </button>
      <Link to="/" className="flex shrink-0 items-center gap-2.5 pr-2">
        <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl" />
        <div className="hidden leading-tight sm:block">
          <div className="text-[15px] font-extrabold tracking-wide text-white">{t("app.name")}</div>
          <div className="text-[11px] text-white/50">Yo‘l harakati nazorati</div>
        </div>
      </Link>

      <nav className="ml-2 hidden items-center gap-1 lg:flex">
        {groups.map((group) => {
          const active = group.items.some((item) => isItemActive(item, pathname));
          const first = group.items[0];
          if (!first) return null;
          return (
            <Link
              key={group.key}
              to={first.to}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition",
                active ? "bg-navy-700 text-white shadow-inner" : "text-white/65 hover:bg-white/5 hover:text-white",
              )}
            >
              <group.icon className="h-4 w-4" />
              {group.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />
      <GlobalSearch />
      <Clock />
      <div className="flex items-center gap-2">
        <HeaderIconButton label="Yangilash" onClick={() => void queryClient.invalidateQueries()}>
          <RefreshCw className="h-4 w-4" />
        </HeaderIconButton>
        <HeaderIconButton label={t("nav.notifications")} to="/notifications">
          <Bell className="h-4 w-4" />
          {unreadTotal > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-navy-900">
              {Math.min(unreadTotal, 99)}
            </span>
          )}
        </HeaderIconButton>
        <span className="hidden sm:block">
          <HeaderIconButton label="O‘zbekcha">
            <Globe className="h-4 w-4" />
          </HeaderIconButton>
        </span>
      </div>
      <div className="ml-1 hidden items-center gap-2.5 sm:flex">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-navy-900">
          {initials(user?.full_name)}
        </div>
        <div className="hidden leading-tight xl:block">
          <div className="max-w-[160px] truncate text-[13px] font-semibold text-white">{user?.full_name}</div>
          <div className="text-[11px] text-white/50">{user?.role_name}</div>
        </div>
      </div>
    </header>
  );
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean | null; value?: string }) {
  return (
    <li className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-2 text-slate-500">
        <span className={cn("h-1.5 w-1.5 rounded-full", ok === null ? "bg-slate-300" : ok ? "bg-emerald-500" : "bg-rose-500")} />
        {label}
      </span>
      <span className={cn("font-medium", ok === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-rose-600")}>
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
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Tizim holati</span>
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", allUp ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
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

function SideNavLink({ item, collapsed, unread, onNavigate }: { item: NavItem; collapsed: boolean; unread: number; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      title={collapsed ? t(item.label) : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-10 items-center gap-3 rounded-[10px] border text-[13px] transition",
          collapsed ? "justify-center px-0" : "px-3",
          isActive
            ? "border-line bg-[#f5f5fb] font-semibold text-navy-900 shadow-soft"
            : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800",
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")} />
          {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
          {item.to === "/notifications" && unread > 0 && (
            <span
              className={cn(
                "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white",
                collapsed && "absolute right-1 top-1",
              )}
            >
              {Math.min(unread, 99)}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({
  open,
  collapsed,
  onClose,
  onToggle,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  const groups = useNavGroups();
  const { pathname } = useLocation();
  const canSeeStatus = useHasPermission("dashboard.view");
  const unread = useUnreadCount().data?.total ?? 0;
  const navigate = useNavigate();
  const activeGroup = groups.find((group) => group.items.some((item) => isItemActive(item, pathname))) ?? groups[0];
  // The drawer on small screens lists every section because the header navigation is hidden there.
  const visibleGroups = open ? groups : activeGroup ? [activeGroup] : [];
  const narrow = collapsed && !open;

  return (
    <>
      <div className={cn("fixed inset-0 z-30 bg-navy-950/50 lg:hidden", open ? "block" : "hidden")} onClick={onClose} aria-hidden />
      <aside
        className={cn(
          "fixed bottom-0 left-0 top-0 z-40 flex flex-col border-r border-line bg-white transition-[width,transform] duration-200 lg:sticky lg:top-16 lg:z-10 lg:h-[calc(100vh-4rem)] lg:translate-x-0",
          narrow ? "w-[72px]" : "w-[240px]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-12 items-center justify-between px-4 pt-2">
          {!narrow && <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{open ? "Bo‘limlar" : activeGroup?.label}</span>}
          <button
            type="button"
            onClick={open ? onClose : onToggle}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-white text-slate-500 shadow-soft hover:text-slate-800",
              narrow && "mx-auto",
            )}
            aria-label={open ? "close" : "toggle sidebar"}
          >
            {open ? <X className="h-4 w-4" /> : <ChevronLeft className={cn("h-4 w-4 transition", collapsed && "rotate-180")} />}
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {visibleGroups.map((group) => (
            <div key={group.key} className="space-y-1">
              {open && <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</div>}
              {group.items.map((item) => (
                <SideNavLink key={item.to} item={item} collapsed={narrow} unread={unread} onNavigate={onClose} />
              ))}
            </div>
          ))}
        </nav>

        <div className="space-y-2 p-3">
          {canSeeStatus && !narrow && <SystemStatusBox />}
          <button
            type="button"
            onClick={() => void logout().finally(() => navigate("/login", { replace: true }))}
            title={narrow ? t("auth.logout") : undefined}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-[10px] text-[13px] text-slate-500 transition hover:bg-rose-50 hover:text-rose-600",
              narrow ? "justify-center" : "px-3",
            )}
          >
            <LogOut className="h-[18px] w-[18px]" />
            {!narrow && t("auth.logout")}
          </button>
        </div>
      </aside>
    </>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const toggle = () =>
    setCollapsed((value) => {
      localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      return !value;
    });

  return (
    <div className="min-h-full">
      <TopHeader onMenu={() => setOpen(true)} />
      <div className="flex">
        <Sidebar open={open} collapsed={collapsed} onClose={() => setOpen(false)} onToggle={toggle} />
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-[1680px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
