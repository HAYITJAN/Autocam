import { Archive, Check, Eye, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { useViolationTransition } from "@/api/queries";
import { Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ViolationAction, ViolationDetail } from "@/lib/types";

const ACTION_STYLE: Record<ViolationAction, { className: string; icon: typeof Check }> = {
  review: { className: "btn-secondary", icon: Eye },
  confirm: { className: "btn-primary", icon: Check },
  reject: { className: "btn-danger", icon: X },
  archive: { className: "btn-secondary", icon: Archive },
  reopen: { className: "btn-secondary", icon: RotateCcw },
};

/** Status workflow buttons; only the actions the API allows for this user are shown. */
export function ViolationActions({ violation, className }: { violation: ViolationDetail; className?: string }) {
  const transition = useViolationTransition(violation.id);
  const [pending, setPending] = useState<ViolationAction | null>(null);
  const [text, setText] = useState("");

  if (violation.allowed_actions.length === 0) return null;

  const needsText = pending === "reject" || pending === "confirm";
  const run = (action: ViolationAction, comment?: string) =>
    transition.mutate(
      { action, comment },
      {
        onSuccess: () => {
          setPending(null);
          setText("");
        },
      },
    );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        {violation.allowed_actions.map((action) => {
          const { className: style, icon: Icon } = ACTION_STYLE[action];
          return (
            <button
              key={action}
              type="button"
              className={cn(style, "flex-1", pending === action && "ring-2 ring-brand-200 ring-offset-1")}
              disabled={transition.isPending}
              onClick={() => (action === "reject" || action === "confirm" ? setPending(action) : run(action))}
            >
              <Icon className="h-4 w-4" />
              {t(`violation.action.${action}`)}
            </button>
          );
        })}
      </div>
      {needsText && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(pending, text.trim() || undefined);
          }}
        >
          <textarea
            className="input min-h-20"
            placeholder={pending === "reject" ? t("violation.rejectReason") : `${t("violation.comment")} (ixtiyoriy)`}
            required={pending === "reject"}
            minLength={pending === "reject" ? 3 : undefined}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className={pending === "reject" ? "btn-danger" : "btn-primary"} disabled={transition.isPending}>
              {transition.isPending && <Spinner className="h-4 w-4 text-white" />}
              {t(`violation.action.${pending}`)}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPending(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
      {transition.isError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {transition.error instanceof ApiError ? transition.error.message : t("common.error")}
        </p>
      )}
    </div>
  );
}
