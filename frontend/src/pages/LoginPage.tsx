import { Lock, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Spinner } from "@/components/ui";
import { ApiError, login } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "ACCOUNT_LOCKED") return t("auth.locked");
    if (error.code === "ACCOUNT_DISABLED") return t("auth.disabled");
    if (error.status === 401 || error.status === 422) return t("auth.invalid");
    return error.message;
  }
  return t("common.error");
}

export default function LoginPage() {
  const status = useAuthStore((state) => state.status);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-navy-900 p-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-violet-500/20 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="h-14 w-14 rounded-2xl shadow-lg shadow-brand-600/30" />
          <h1 className="mt-3 text-2xl font-extrabold tracking-wide text-white">{t("app.name")}</h1>
          <p className="mt-1 text-[13px] text-white/50">{t("app.tagline")}</p>
        </div>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4 rounded-2xl bg-white p-6 shadow-2xl shadow-navy-950/40">
          <div>
            <h2 className="text-lg font-bold text-navy-900">{t("auth.title")}</h2>
            <p className="text-[13px] text-slate-500">{t("auth.subtitle")}</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-slate-700">{t("auth.login")}</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="input pl-9"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-slate-700">{t("auth.password")}</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="input pl-9"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </label>
          {error && <p className="rounded-[10px] bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{error}</p>}
          <button type="submit" className="btn-primary h-10 w-full" disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4 text-white" />}
            {t("auth.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
