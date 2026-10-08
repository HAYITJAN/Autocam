import { create } from "zustand";

import type { TokenResponse, UserProfile } from "@/lib/types";

type AuthStatus = "unknown" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  // Kept in memory only; the refresh token lives in an HttpOnly cookie.
  accessToken: string | null;
  user: UserProfile | null;
  setSession: (tokens: TokenResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "unknown",
  accessToken: null,
  user: null,
  setSession: (tokens) => set({ status: "authenticated", accessToken: tokens.access_token, user: tokens.user }),
  clear: () => set({ status: "anonymous", accessToken: null, user: null }),
}));

export function useHasPermission(...codes: string[]): boolean {
  const permissions = useAuthStore((state) => state.user?.permissions);
  if (!permissions) return false;
  return codes.every((code) => permissions.includes(code));
}
