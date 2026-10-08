import { useQueryClient } from "@tanstack/react-query";
import { Bell, FileText, Headset, LayoutGrid, LogOut, RefreshCw, Search, Settings, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useSystemStatus, useUnreadCount } from "@/api/queries";
import { logout } from "@/lib/api";
import { cn, DISPLAY_TZ } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";

interface NavItem {
  to: string;
  label: MessageKey;
  permission?: string;
}

interface RailItem extends NavItem {
  icon: LucideIcon;
}

/** Primary sections, in the order an operator works through them. */
const SECTIONS: (NavItem & { short?: string })[] = [
  { to: "/", label: "nav.dashboard", short: "Umumiy", permission: "dashboard.view" },
  { to: "/monitoring", label: "nav.monitoring", short: "Monitoring", permission: "monitoring.view" },
  { to: "/cameras", label: "nav.cameras", permission: "cameras.view" },
  { to: "/violations", label: "nav.violations", permission: "violations.view" },
  { to: "/vehicles", label: "nav.vehicles", permission: "vehicles.view" },
  { to: "/map", label: "nav.map", permission: "monitoring.view" },
  { to: "/analytics", label: "nav.analytics", short: "Tahlil", permission: "analytics.view" },
];

/** Secondary tools on the icon rail. */
const RAIL: RailItem[] = [
  { to: "/", label: "nav.dashboard", icon: LayoutGrid, permission: "dashboard.view" },
  { to: "/notifications", label: "nav.notifications", icon: Bell },
  { to: "/reports", label: "nav.reports", icon: FileText, permission: "reports.view" },
  { to: "/users", label: "nav.users", icon: Users, permission: "users.view" },
  { to: "/settings", label: "nav.settings", icon: Settings, permission: "settings.view" },
];

function usePermitted<T extends NavItem>(items: T[]): T[] {
  const permissions = useAuthStore((state) => state.user?.permissions) ?? [];
  return items.filter((item) => !item.permission || permissions.includes(item.permission));
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
  const time = new Intl.DateTimeFormat("uz-UZ", { timeZone: DISPLAY_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  return <span className="hidden font-mono text-[13px] font-semibold tabular-nums text-ink 2xl:inline">{time}</span>;
}

function initials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label={t("app.name")}>
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <span className="hidden text-[15px] font-bold tracking-tight text-ink xl:block">
        Smart<span className="text-mute">Traffic</span>
      </span>
    </Link>
  );
}

/** Compact system state: one dot per component, like an avatar stack. */
function SystemPulse() {
  const status = useSystemStatus();
  const components = status.data?.components ?? [];
  const allUp = status.data ? components.every((item) => item.state === "up" || !item.critical) : null;
  const labels: Record<string, string> = { database: "Ma’lumotlar bazasi", redis: "Redis", ai_service: "AI modul" };
  return (
    <div className="hidden items-center gap-2 lg:flex" title={components.map((item) => `${labels[item.name] ?? item.name}: ${item.state === "up" ? "online" : "offline"}`).join("\n")}>
      <div className="flex -space-x-2">
        {components.map((item) => (
          <span
            key={item.name}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border-2 border-page text-[10px] font-bold uppercase",
              item.state === "up" ? "bg-accent-300 text-ink" : "bg-ink text-white",
            )}
          >
            {(labels[item.name] ?? item.name).slice(0, 2)}
          </span>
        ))}
        {status.data && (
          <span className="flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-page bg-ink px-1.5 text-[10px] font-bold text-white">
            {status.data.cameras_online}
          </span>
        )}
      </div>
      <span className="pill pointer-events-none">
        <span className={cn("h-2 w-2 rounded-full", allUp === null ? "bg-brand-300" : allUp ? "bg-accent-500" : "bg-amber-400")} />
        {allUp === null ? "Tizim" : allUp ? "Tizim barqaror" : "Qisman ishlayapti"}
      </span>
    </div>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;
    const target = /^cam-?\d+/i.test(query) ? "/cameras" : "/violations";
    navigate(`${target}?search=${encodeURIComponent(query)}`);
    setValue("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="icon-btn" onClick={() => setOpen(true)} title="Qidirish (Ctrl K)" aria-label="search">
        <Search className="h-4 w-4" />
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="relative w-[280px]">
      <Search className="pointer-events-none absolute left-4 top-3 h-4 w-4 text-mute" />
      <input
        ref={input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => !value && setOpen(false)}
        placeholder="Kamera kodi, raqam yoki ID…"
        className="input pl-10 pr-10"
      />
      <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 text-mute hover:text-ink" aria-label="close">
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}

function TopBar() {
  const user = useAuthStore((state) => state.user);
  const unread = useUnreadCount().data?.total ?? 0;
  const queryClient = useQueryClient();
  const sections = usePermitted(SECTIONS);

  return (
    <header className="sticky top-0 z-30 bg-page/85 backdrop-blur-md">
      <div className="flex h-[72px] items-center gap-4 px-4 lg:px-6">
        <Logo />
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
          {sections.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => cn("pill", isActive && "pill-active")}>
              {item.short ?? t(item.label)}
            </NavLink>
          ))}
        </nav>
        <SystemPulse />
        <Clock />
        <div className="flex items-center gap-2">
          <SearchBox />
          <button type="button" className="icon-btn hidden sm:inline-flex" onClick={() => void queryClient.invalidateQueries()} title="Yangilash" aria-label="refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link to="/notifications" className="icon-btn relative" title={t("nav.notifications")} aria-label={t("nav.notifications")}>
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-400 px-1 text-[10px] font-bold text-ink ring-2 ring-page">
                {Math.min(unread, 99)}
              </span>
            )}
          </Link>
          <UserMenu name={user?.full_name} role={user?.role_name} />
        </div>
      </div>
    </header>
  );
}

function UserMenu({ name, role }: { name: string | undefined; role: string | undefined }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative pl-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-xs font-bold text-white ring-2 ring-white"
        aria-label="user menu"
      >
        {initials(name)}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-56 rounded-2xl border border-line bg-white p-2 shadow-lift">
          <div className="px-3 py-2">
            <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
            <div className="text-xs text-mute">{role}</div>
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-ink/80 hover:bg-soft">
            <Bell className="h-4 w-4" /> {t("nav.notifications")}
          </Link>
          <button
            type="button"
            onClick={() => void logout().finally(() => navigate("/login", { replace: true }))}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> {t("auth.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

function Rail() {
  const items = usePermitted(RAIL);
  const unread = useUnreadCount().data?.total ?? 0;
  const navigate = useNavigate();
  return (
    <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[76px] shrink-0 flex-col items-center gap-3 py-6 md:flex">
      <nav className="flex flex-1 flex-col items-center gap-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            title={t(item.label)}
            aria-label={t(item.label)}
            className={({ isActive }) => cn("icon-btn relative", isActive && "border-ink bg-ink text-white hover:bg-ink")}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.to === "/notifications" && unread > 0 && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-accent-400 ring-2 ring-white" />}
          </NavLink>
        ))}
      </nav>
      <a href="mailto:support@smart-traffic.local" className="icon-btn" title="Yordam" aria-label="support">
        <Headset className="h-[18px] w-[18px]" />
      </a>
      <button
        type="button"
        className="icon-btn hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
        title={t("auth.logout")}
        aria-label={t("auth.logout")}
        onClick={() => void logout().finally(() => navigate("/login", { replace: true }))}
      >
        <LogOut className="h-[18px] w-[18px]" />
      </button>
    </aside>
  );
}

export function Layout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-full">
      <TopBar />
      <div className="flex">
        <Rail />
        <main className="min-w-0 flex-1 px-4 pb-10 pt-2 md:pl-0 lg:pr-6">
          <div className="mx-auto max-w-[1680px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
