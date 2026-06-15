export type Theme = "emerald" | "crimson" | "charcoal";

export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: "emerald", label: "Emerald", swatch: "#0D5C3A" },
  { id: "crimson", label: "Crimson", swatch: "#98191D" },
  { id: "charcoal", label: "Charcoal", swatch: "#232227" },
];

const KEY = "sarooj-theme";

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  if (v === "crimson" || v === "charcoal") return v;
  return "emerald";
}

export function applyTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  if (theme === "emerald") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
