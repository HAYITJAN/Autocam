import { AlertOctagon, AlertTriangle, Bell, Info, ShieldAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useNotificationAction, useNotifications, useReadAllNotifications } from "@/api/queries";
import { Card, Pagination, PageHeader, QueryView } from "@/components/ui";
import { cn, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { NotificationState, NotificationType } from "@/lib/types";

const TYPE_ICON: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  CRITICAL: { icon: AlertOctagon, className: "bg-red-50 text-red-600" },
  WARNING: { icon: AlertTriangle, className: "bg-amber-50 text-amber-600" },
  INFO: { icon: Info, className: "bg-sky-50 text-sky-600" },
  SYSTEM: { icon: Bell, className: "bg-slate-100 text-slate-600" },
  VIOLATION: { icon: ShieldAlert, className: "bg-violet-50 text-violet-600" },
};

const TABS: { state?: NotificationState; label: string }[] = [
  { label: t("common.all") },
  { state: "UNREAD", label: t("notifications.unread") },
  { state: "READ", label: t("notifications.read") },
  { state: "ARCHIVED", label: t("notifications.archive") },
];

export default function NotificationsPage() {
  const [state, setState] = useState<NotificationState | undefined>("UNREAD");
  const [page, setPage] = useState(1);
  const notifications = useNotifications({ state, page });
  const action = useNotificationAction();
  const readAll = useReadAllNotifications();

  return (
    <>
      <PageHeader
        title={t("nav.notifications")}
        actions={
          <button type="button" className="btn-secondary" disabled={readAll.isPending} onClick={() => readAll.mutate()}>
            {t("notifications.markAllRead")}
          </button>
        }
      />
      <Card>
        <div className="flex gap-1 border-b border-slate-100 px-4">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => {
                setState(tab.state);
                setPage(1);
              }}
              className={cn(
                "-mb-px border-b-2 px-3 py-3 text-sm font-medium",
                state === tab.state ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <QueryView query={notifications} isEmpty={(data) => data.items.length === 0}>
          {(data) => (
            <>
              <ul className="divide-y divide-slate-100">
                {data.items.map((item) => {
                  const { icon: Icon, className } = TYPE_ICON[item.type];
                  return (
                    <li key={item.id} className={cn("flex gap-4 px-5 py-4", item.state === "UNREAD" && "bg-brand-50/40")}>
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", className)}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={cn("text-sm", item.state === "UNREAD" ? "font-semibold text-slate-900" : "text-slate-700")}>
                            {item.link ? (
                              <Link to={item.link} className="hover:underline">
                                {item.title}
                              </Link>
                            ) : (
                              item.title
                            )}
                          </p>
                          <span className="shrink-0 text-xs text-slate-400">{formatRelative(item.created_at)}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-600">{item.message}</p>
                        <div className="mt-2 flex gap-3 text-xs">
                          {item.state === "UNREAD" ? (
                            <button type="button" className="text-brand-700 hover:underline" onClick={() => action.mutate({ id: item.id, action: "read" })}>
                              {t("notifications.markRead")}
                            </button>
                          ) : (
                            <button type="button" className="text-slate-500 hover:underline" onClick={() => action.mutate({ id: item.id, action: "unread" })}>
                              {t("notifications.markUnread")}
                            </button>
                          )}
                          {item.state !== "ARCHIVED" && (
                            <button type="button" className="text-slate-500 hover:underline" onClick={() => action.mutate({ id: item.id, action: "archive" })}>
                              {t("notifications.archive")}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Pagination meta={data.meta} onPage={setPage} />
            </>
          )}
        </QueryView>
      </Card>
    </>
  );
}
