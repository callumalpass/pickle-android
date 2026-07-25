export type Theme = "system" | "light" | "dark";

export function currentTheme(): Theme {
  const stored = localStorage.getItem("pickle.theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function applyTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function applyStoredTheme(): void {
  applyTheme(currentTheme());
}
