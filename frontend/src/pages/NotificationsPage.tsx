import { AlertOctagon, AlertTriangle, Bell, CheckCheck, Info, ShieldAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useNotificationAction, useNotifications, useReadAllNotifications } from "@/api/queries";
import { Card, Pagination, PageHeader, QueryView } from "@/components/ui";
import { cn, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { NotificationState, NotificationType } from "@/lib/types";

const TYPE_ICON: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  CRITICAL: { icon: AlertOctagon, className: "bg-rose-100 text-rose-600" },
  WARNING: { icon: AlertTriangle, className: "bg-amber-100 text-amber-600" },
  INFO: { icon: Info, className: "bg-soft text-ink" },
  SYSTEM: { icon: Bell, className: "bg-soft text-ink/70" },
  VIOLATION: { icon: ShieldAlert, className: "bg-ink text-white" },
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
        subtitle="Tizim, kamera va qoidabuzarlik bo‘yicha ogohlantirishlar"
        actions={
          <button type="button" className="btn-primary" disabled={readAll.isPending} onClick={() => readAll.mutate()}>
            <CheckCheck className="h-4 w-4" /> {t("notifications.markAllRead")}
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => {
              setState(tab.state);
              setPage(1);
            }}
            className={cn("pill", state === tab.state && "pill-active")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Card>
        <QueryView query={notifications} isEmpty={(data) => data.items.length === 0}>
          {(data) => (
            <>
              <ul className="divide-y divide-line">
                {data.items.map((item) => {
                  const { icon: Icon, className } = TYPE_ICON[item.type];
                  return (
                    <li key={item.id} className={cn("flex gap-4 px-5 py-4", item.state === "UNREAD" && "bg-accent-50/60")}>
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", className)}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={cn("text-sm", item.state === "UNREAD" ? "font-semibold text-ink" : "text-ink/80")}>
                            {item.link ? (
                              <Link to={item.link} className="hover:underline">
                                {item.title}
                              </Link>
                            ) : (
                              item.title
                            )}
                          </p>
                          <span className="shrink-0 text-xs text-mute">{formatRelative(item.created_at)}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-ink/70">{item.message}</p>
                        <div className="mt-2 flex gap-3 text-xs">
                          {item.state === "UNREAD" ? (
                            <button type="button" className="font-semibold text-ink hover:underline" onClick={() => action.mutate({ id: item.id, action: "read" })}>
                              {t("notifications.markRead")}
                            </button>
                          ) : (
                            <button type="button" className="text-mute hover:underline" onClick={() => action.mutate({ id: item.id, action: "unread" })}>
                              {t("notifications.markUnread")}
                            </button>
                          )}
                          {item.state !== "ARCHIVED" && (
                            <button type="button" className="text-mute hover:underline" onClick={() => action.mutate({ id: item.id, action: "archive" })}>
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
