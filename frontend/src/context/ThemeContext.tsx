import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); localStorage.setItem("theme", theme); }, [theme]);
  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme((value) => value === "dark" ? "light" : "dark") }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value=useContext(ThemeContext); if(!value) throw new Error("ThemeProvider missing"); return value; }