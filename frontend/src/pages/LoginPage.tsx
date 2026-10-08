import { Activity, Camera, Lock, ShieldCheck, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Spinner } from "@/components/ui";
import { ApiError, login } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth";

const FEATURES = [
  { icon: Camera, text: "Kameralar holati va jonli monitoring" },
  { icon: ShieldCheck, text: "AI aniqlagan qoidabuzarliklarni tekshirish" },
  { icon: Activity, text: "Hududlar va vaqt bo‘yicha tahlil" },
];

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
    <div className="flex min-h-full items-center justify-center bg-page p-4">
      <div className="grid w-full max-w-[960px] gap-4 md:grid-cols-[1.1fr_1fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden rounded-card bg-ink p-8 text-white md:flex">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent-400/25 blur-3xl" />
          <div className="relative flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl bg-white p-1" />
            <span className="text-lg font-semibold tracking-tight">
              Smart<span className="text-white/50">Traffic</span>
            </span>
          </div>
          <div className="relative mt-16">
            <h1 className="text-[34px] font-medium leading-tight tracking-tight">
              Toshkent yo‘llari
              <br />
              <span className="text-accent-300">real vaqtda</span> nazoratda
            </h1>
            <p className="mt-3 max-w-sm text-sm text-white/60">{t("app.tagline")}</p>
          </div>
          <ul className="relative mt-10 space-y-3 text-sm text-white/80">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <Icon className="h-4 w-4 text-accent-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={(event) => void onSubmit(event)} className="card space-y-5 p-8 shadow-soft">
          <div className="flex items-center gap-2.5 md:hidden">
            <img src="/favicon.svg" alt="" className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight text-ink">
              Smart<span className="text-mute">Traffic</span>
            </span>
          </div>
          <div>
            <h2 className="text-[26px] font-medium tracking-tight text-ink">{t("auth.title")}</h2>
            <p className="mt-1 text-[13px] text-mute">{t("auth.subtitle")}</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-ink/80">{t("auth.login")}</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" />
              <input
                className="input pl-10"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-ink/80">{t("auth.password")}</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" />
              <input
                className="input pl-10"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </label>
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-600">{error}</p>}
          <button type="submit" className="btn-primary h-11 w-full" disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4 text-white" />}
            {t("auth.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
