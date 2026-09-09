import { createContext, useContext, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, type Session } from "@/lib/api";

interface Registration { name: string; restaurant_name: string; email: string; password: string }
interface AuthContextValue { session: Session | null; loading: boolean; login: (email: string, password: string) => Promise<Session>; register: (body: Registration) => Promise<void>; logout: () => void; refresh: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: () => apiGet<Session>("/auth/me"), retry: false, enabled: Boolean(token) });
  const loginMutation = useMutation({ mutationFn: (body: { email: string; password: string }) => apiPost<{ access_token: string }>("/auth/login", body) });
  const registerMutation = useMutation({ mutationFn: (body: Registration) => apiPost<{ access_token: string }>("/auth/register", body) });
  const begin = async (nextToken: string) => { localStorage.setItem("token", nextToken); setToken(nextToken); const session=await apiGet<Session>("/auth/me"); queryClient.setQueryData(["session"],session); return session; };
  const login = async (email: string, password: string) => begin((await loginMutation.mutateAsync({ email, password })).access_token);
  const register = async (body: Registration) => { await begin((await registerMutation.mutateAsync(body)).access_token); };
  const logout = () => { localStorage.removeItem("token"); setToken(null); queryClient.setQueryData(["session"], null); window.location.assign("/login"); };
  return <AuthContext.Provider value={{ session: sessionQuery.data ?? null, loading: Boolean(token) && sessionQuery.isLoading, login, register, logout, refresh: async () => { await sessionQuery.refetch(); } }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider"); return value; }