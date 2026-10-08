import { Camera, Car, LayoutDashboard, Shapes, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/format";

import type { ViolationFiltersState } from "./filters";

const TABS: { to: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: "/violations", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/violations/types", label: "Qoidabuzarlik turlari", icon: Shapes },
  { to: "/violations/vehicles", label: "Avtomobillar", icon: Car },
  { to: "/violations/cameras", label: "Kameralar", icon: Camera },
];

/** Sub-navigation of the violations module; tab links keep the active filters. */
export function ViolationsNav({ filters }: { filters: ViolationFiltersState }) {
  const { pathname } = useLocation();
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Qoidabuzarliklar bo‘limlari">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
        return (
          <Link key={tab.to} to={filters.linkTo(tab.to)} className={cn("pill", active && "pill-active")}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
