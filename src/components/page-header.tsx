import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  count,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[15px] font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
            {title}
          </h1>
          {typeof count === "number" ? (
            <span className="text-xs tabular-nums text-neutral-400">{count}</span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 max-w-2xl text-sm leading-5 text-neutral-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}
