import type { ReactNode } from "react";

/** A titled block on a settings page, separated by a hairline. Anchorable by id. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex scroll-mt-6 flex-col gap-4 border-b border-neutral-200 py-8 first:pt-0 last:border-b-0 dark:border-neutral-800"
    >
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
