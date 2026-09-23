"use client";

import Link from "next/link";
import { SearchIcon } from "@/components/icons";
import { btnGhost, cn, inputBase, segmentItem, segmentTrack } from "@/lib/ui";

const STATUSES = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "archived", label: "Archived" },
  { value: "spam", label: "Spam" },
] as const;

function hrefWith(
  basePath: string,
  current: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const key of ["q", "form", "status"] as const) {
    const value = next[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** One row: status, search, optional form picker, export. All plain GET links/forms. */
export function InboxFilters({
  basePath,
  current,
  forms,
  exportHref,
}: {
  basePath: string;
  current: Record<string, string | undefined>;
  forms?: { id: string; name: string }[];
  exportHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Status" className={segmentTrack}>
        {STATUSES.map((status) => {
          const active = (current.status ?? "") === status.value;
          return (
            <Link
              key={status.label}
              href={hrefWith(basePath, current, { status: status.value || undefined })}
              className={segmentItem(active)}
              aria-current={active ? "page" : undefined}
            >
              {status.label}
            </Link>
          );
        })}
      </nav>

      <form
        method="GET"
        action={basePath}
        role="search"
        className="flex min-w-48 flex-1 items-center gap-2"
      >
        {current.status ? <input type="hidden" name="status" value={current.status} /> : null}
        {forms ? (
          <select
            name="form"
            aria-label="Form"
            defaultValue={current.form ?? ""}
            className={cn(inputBase, "h-8 max-w-44 text-xs")}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            <option value="">All forms</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-neutral-400">
            <SearchIcon />
          </span>
          <input
            name="q"
            type="search"
            key={current.q ?? ""}
            defaultValue={current.q ?? ""}
            placeholder="Search"
            className={cn(inputBase, "h-8 w-full ps-8 text-xs")}
          />
        </label>
      </form>

      <a href={exportHref} className={`${btnGhost} no-underline`}>
        Export CSV
      </a>
    </div>
  );
}
