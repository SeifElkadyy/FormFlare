"use client";

import type { ReactNode } from "react";
import { cardClass, hintClass } from "@/lib/ui";

export function FormFold({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <details className={cardClass}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span className="font-medium text-neutral-800 dark:text-neutral-200">{title}</span>
        <span className={`${hintClass} min-w-0 truncate`}>{status}</span>
      </summary>
      <div className="mt-4 flex flex-col gap-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
        {children}
      </div>
    </details>
  );
}
