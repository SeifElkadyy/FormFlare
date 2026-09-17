"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FilterIcon } from "@/components/icons";
import { btnGhost, btnSecondary, cn, inputClass, labelClass, selectClass } from "@/lib/ui";

const STATUSES = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "read", label: "Read" },
  { value: "archived", label: "Archived" },
  { value: "spam", label: "Spam" },
] as const;

function inboxHref(
  current: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const key of ["q", "form", "status", "from", "to"] as const) {
    const value = next[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/inbox?${qs}` : "/inbox";
}

/**
 * Inbox filters.
 *
 * Status is a compact tab strip (instant, bookmarkable). Form and dates live in a
 * popover so the bar stays narrow. Search stays in the shell header.
 */
export function InboxFilters({
  forms,
  current,
}: {
  forms: { id: string; name: string }[];
  current: Record<string, string | undefined>;
}) {
  const extra = Boolean(current.form || current.from || current.to);
  const extraLabel = [
    forms.find((form) => form.id === current.form)?.name,
    current.from || current.to ? "dates" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-2.5 dark:border-neutral-800">
      <nav aria-label="Status" className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex h-8 items-center rounded-xl bg-neutral-100 p-0.5 dark:bg-neutral-800">
          {STATUSES.map((status) => {
            const active = (current.status ?? "") === status.value;
            return (
              <Link
                key={status.label}
                href={inboxHref(current, { status: status.value || undefined })}
                className={cn(
                  "flex h-7 items-center justify-center rounded-lg px-2.5 text-xs leading-none no-underline",
                  active
                    ? "bg-white font-medium text-neutral-900 shadow-[var(--shadow-border)] dark:bg-neutral-700 dark:text-neutral-50"
                    : "font-medium text-neutral-500",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="translate-y-px">{status.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <MoreFilters forms={forms} current={current} extra={extra} extraLabel={extraLabel} />
    </div>
  );
}

function MoreFilters({
  forms,
  current,
  extra,
  extraLabel,
}: {
  forms: { id: string; name: string }[];
  current: Record<string, string | undefined>;
  extra: boolean;
  extraLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={panel} className="relative shrink-0">
      <button
        type="button"
        className={cn(btnSecondary, "h-8 ps-3 pe-3 text-xs")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <FilterIcon />
        {extra ? extraLabel || "Filters" : "Filters"}
      </button>

      {open ? (
        <form
          method="GET"
          action="/inbox"
          className="absolute top-full right-0 z-20 mt-2 w-72 rounded-[20px] bg-white p-3 shadow-[var(--shadow-border),0_16px_40px_oklch(0_0_0_/_0.08)] dark:bg-neutral-900"
        >
          {current.q ? <input type="hidden" name="q" value={current.q} /> : null}
          {current.status ? <input type="hidden" name="status" value={current.status} /> : null}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="form" className={labelClass}>
                Form
              </label>
              <select
                id="form"
                name="form"
                defaultValue={current.form ?? ""}
                className={selectClass}
              >
                <option value="">All forms</option>
                {forms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="from" className={labelClass}>
                  From
                </label>
                <input
                  id="from"
                  name="from"
                  type="date"
                  defaultValue={current.from ?? ""}
                  className={`${inputClass} px-2.5`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="to" className={labelClass}>
                  To
                </label>
                <input
                  id="to"
                  name="to"
                  type="date"
                  defaultValue={current.to ?? ""}
                  className={`${inputClass} px-2.5`}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            {extra ? (
              <Link
                href={inboxHref(current, { form: undefined, from: undefined, to: undefined })}
                className={`${btnGhost} no-underline`}
              >
                Clear
              </Link>
            ) : (
              <span />
            )}
            <button type="submit" className={`${btnSecondary} h-8 px-3 text-xs`}>
              Apply
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
