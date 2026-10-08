import type { PageMeta, Paged, TokenResponse } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PageMeta | Record<string, unknown> | null;
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string | null;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId ?? null;
  }
}

/** Media URLs from the API are server-absolute paths; resolve them against the API origin. */
export function mediaUrl(path: string): string {
  if (/^https?:\/\//.test(path) || !/^https?:\/\//.test(API_BASE)) return path;
  return new URL(path, API_BASE).toString();
}

export type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;
export type QueryParams = Record<string, QueryValue>;

function buildUrl(path: string, params?: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const query = search.toString();
  return `${API_BASE}${path}${query ? `?${query}` : ""}`;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ErrorEnvelope>;
    if (body.error) {
      return new ApiError(response.status, body.error.code, body.error.message, body.error.details, body.error.request_id);
    }
  } catch {
    // Non-JSON error bodies (proxy failures) fall through to the generic error.
  }
  return new ApiError(response.status, "HTTP_ERROR", response.statusText || `HTTP ${response.status}`);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotates the HttpOnly refresh cookie; concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
      if (!response.ok) {
        useAuthStore.getState().clear();
        return false;
      }
      const body = (await response.json()) as SuccessEnvelope<TokenResponse>;
      useAuthStore.getState().setSession(body.data);
      return true;
    } catch {
      useAuthStore.getState().clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
}

async function send(path: string, options: RequestOptions, retried = false): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = useAuthStore.getState().accessToken;
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(buildUrl(path, options.params), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "include",
    signal: options.signal,
  });

  if (response.status === 401 && options.auth !== false && !retried) {
    if (await refreshSession()) return send(path, options, true);
  }
  if (!response.ok) throw await parseError(response);
  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as SuccessEnvelope<T>;
  return body.data;
}

export async function requestPage<T>(path: string, options: RequestOptions = {}): Promise<Paged<T>> {
  const response = await send(path, options);
  const body = (await response.json()) as SuccessEnvelope<T[]>;
  const meta = (body.meta as PageMeta | undefined) ?? {
    page: 1,
    page_size: body.data.length,
    total: body.data.length,
    pages: 1,
  };
  return { items: body.data, meta };
}

export async function login(usernameOrEmail: string, password: string): Promise<TokenResponse> {
  const data = await request<TokenResponse>("/auth/login", {
    method: "POST",
    body: { username_or_email: usernameOrEmail, password },
    auth: false,
  });
  useAuthStore.getState().setSession(data);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await request<void>("/auth/logout", { method: "POST" });
  } finally {
    useAuthStore.getState().clear();
  }
}
