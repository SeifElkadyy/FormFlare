import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Rendered under the title row, e.g. tabs. */
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-neutral-200 px-6 pt-6 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start justify-between gap-4 pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink dark:text-mist">{title}</h1>
          {description ? (
            <div className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mx-auto w-full max-w-5xl">{children}</div> : null}
    </div>
  );
}

/**
 * Content column under a PageHeader, aligned with it. `narrow` keeps long settings forms
 * readable; it stays left-aligned so it lines up with the header's title.
 */
export function PageBody({
  children,
  className = "",
  narrow = false,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <div className="px-6 py-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className={`${narrow ? "max-w-3xl" : ""} ${className}`}>{children}</div>
      </div>
    </div>
  );
}
