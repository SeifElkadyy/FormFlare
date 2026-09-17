"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

function helloFromHour(hour: number): string {
  if (hour < 0) return "Welcome back";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeGreeting({ email }: { email: string }) {
  const hour = useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => -1,
  );
  const local = email.split("@")[0] || "there";

  return (
    <div className="min-w-0">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
        {helloFromHour(hour)}
      </h1>
      <p className="mt-1 truncate text-sm text-neutral-500">{local}</p>
    </div>
  );
}
