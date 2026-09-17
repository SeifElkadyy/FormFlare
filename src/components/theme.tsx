"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { cn } from "@/lib/ui";
import { THEME_KEY } from "@/lib/theme";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("formflare-theme", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("formflare-theme", onStoreChange);
  };
}

function readTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function withoutThemeTransitions(update: () => void) {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none !important}";
  document.head.appendChild(style);
  update();
  const _flushReflow = document.body.offsetHeight;
  void _flushReflow;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => style.remove());
  });
}

export function useTheme() {
  return useSyncExternalStore(subscribe, readTheme, () => "light" as const);
}

export function setTheme(next: "light" | "dark") {
  const apply = () => {
    const root = document.documentElement;
    try {
      if (next === "dark") {
        localStorage.setItem(THEME_KEY, "dark");
        root.classList.add("dark");
        root.classList.remove("light");
      } else {
        localStorage.removeItem(THEME_KEY);
        root.classList.add("light");
        root.classList.remove("dark");
      }
    } catch {
      root.classList.toggle("dark", next === "dark");
      root.classList.toggle("light", next !== "dark");
    }
    window.dispatchEvent(new Event("formflare-theme"));
  };

  withoutThemeTransitions(apply);
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={cn(
        "press relative flex size-9 items-center justify-center rounded-lg text-neutral-500",
        className,
      )}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="invisible size-4" aria-hidden />
      <span
        className={cn(
          "absolute transition-[opacity,scale,filter] duration-150 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
          isDark ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
        )}
      >
        <SunIcon />
      </span>
      <span
        className={cn(
          "absolute transition-[opacity,scale,filter] duration-150 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
          isDark ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
        )}
      >
        <MoonIcon />
      </span>
    </button>
  );
}
