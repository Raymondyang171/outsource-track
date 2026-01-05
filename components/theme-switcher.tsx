"use client";

import { useEffect, useState } from "react";

const THEMES = [
  { id: "ocean", className: "theme-ocean" },
  { id: "coral", className: "theme-coral" },
  { id: "forest", className: "theme-forest" },
  { id: "sand", className: "theme-sand" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>("ocean");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme") as ThemeId | null;
    if (stored && THEMES.some((t) => t.id === stored)) {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="theme-switcher" role="group" aria-label="Theme">
      {THEMES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`theme-pill ${item.className} ${theme === item.id ? "active" : ""}`}
          onClick={() => setTheme(item.id)}
          aria-label={`Theme ${item.id}`}
          aria-pressed={theme === item.id}
        />
      ))}
    </div>
  );
}
