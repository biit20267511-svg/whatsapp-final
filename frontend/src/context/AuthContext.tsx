import { createContext, useContext, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, type Session } from "@/lib/api";

interface AuthContextValue { session: Session | null; loading: boolean; login: (email: string, password: string) => Promise<Session>; applyToken: (token: string) => Promise<Session>; logout: () => void; refresh: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: () => apiGet<Session>("/auth/me"), retry: false, enabled: Boolean(token) });
  const loginMutation = useMutation({ mutationFn: (body: { email: string; password: string }) => apiPost<{ access_token: string }>("/auth/login", body) });
  const applyToken = async (nextToken: string) => { localStorage.setItem("token", nextToken); setToken(nextToken); const session = await apiGet<Session>("/auth/me"); queryClient.setQueryData(["session"], session); return session; };
  const login = async (email: string, password: string) => applyToken((await loginMutation.mutateAsync({ email, password })).access_token);
  const logout = () => { localStorage.removeItem("token"); setToken(null); queryClient.clear(); window.location.assign("/login"); };
  return <AuthContext.Provider value={{ session: sessionQuery.data ?? null, loading: Boolean(token) && sessionQuery.isLoading, login, applyToken, logout, refresh: async () => { await sessionQuery.refetch(); } }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider"); return value; }
