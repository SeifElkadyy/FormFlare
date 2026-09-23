"use client";

import { useState, type ReactNode } from "react";
import { deleteSubmissionAction, setStatusAction } from "./actions";
import { LocalTime } from "./local-time";
import { CopyButton } from "@/components/copy-button";
import { Notice } from "@/components/notice";
import { ArchiveIcon, MailOpenIcon, SpamIcon, TrashIcon } from "@/components/icons";
import { btnDanger, btnIcon, btnToolbar } from "@/lib/ui";

interface Props {
  /** Show which form it came from (the all-forms Inbox), not inside a form's own tab. */
  showForm?: boolean;
  submission: {
    id: string;
    formName: string;
    email: string | null;
    dataJson: string;
    status: string;
    waitlistPosition: number | null;
    country: string | null;
    createdAt: number;
    confirmUrl: string | null;
  };
}

export function SubmissionCard({ submission, showForm = true }: Props) {
  const [open, setOpen] = useState(false);
  const data = safeParse(submission.dataJson);
  const preview = firstPreview(data);
  const unread = submission.status === "new";

  return (
    <li className="group relative border-b border-neutral-100 bg-white last:border-b-0 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-stretch hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left sm:pr-40"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${unread ? "bg-ink dark:bg-mist" : "bg-transparent"}`}
            aria-label={unread ? "Unread" : undefined}
          />
          <span className="grid min-w-0 flex-1 grid-cols-1 items-center gap-x-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
            <span
              className={`truncate text-sm ${unread ? "font-semibold text-ink dark:text-mist" : "text-neutral-700 dark:text-neutral-300"}`}
            >
              {submission.email ?? "No email"}
              {submission.confirmUrl ? (
                <span className="ms-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Unconfirmed
                </span>
              ) : null}
            </span>
            <span className="hidden truncate text-sm text-neutral-500 sm:block">
              {showForm ? `${submission.formName} · ` : ""}
              {submission.waitlistPosition !== null ? `#${submission.waitlistPosition} · ` : ""}
              {preview}
            </span>
            <time
              className={`hidden text-xs tabular-nums text-neutral-400 sm:block ${open ? "" : "hover-fade"}`}
            >
              <LocalTime timestamp={submission.createdAt} />
            </time>
          </span>
        </button>

        {open ? null : (
          <div className="hover-reveal absolute inset-y-0 right-3 flex items-center gap-1">
            <RowActions submission={submission} compact />
          </div>
        )}
      </div>

      {open ? (
        <div className="px-4 pb-4 ps-8">
          <dl className="rounded-lg bg-neutral-50 px-4 py-1 dark:bg-neutral-950/50">
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="flex gap-4 py-2.5">
                <dt className="w-28 shrink-0 text-xs font-medium text-neutral-400">{key}</dt>
                <dd className="break-all text-sm text-neutral-800 dark:text-neutral-200">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-neutral-400">
              {submission.country ?? "Unknown country"}
              {" · "}
              <LocalTime timestamp={submission.createdAt} />
            </span>
            <RowActions submission={submission} />
          </div>
          {submission.confirmUrl ? (
            <div className="mt-3 flex flex-col gap-2">
              <Notice tone="warning">
                Email is not confirmed yet. Copy this link if you need to confirm them yourself.
              </Notice>
              <div className="flex items-center justify-end">
                <CopyButton text={submission.confirmUrl} label="Copy confirm link" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function RowActions({
  submission,
  compact = false,
}: {
  submission: Props["submission"];
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {submission.status !== "read" ? (
        <StatusButton
          id={submission.id}
          status="read"
          label="Mark read"
          icon={<MailOpenIcon />}
          compact={compact}
        />
      ) : null}
      {submission.status !== "archived" ? (
        <StatusButton
          id={submission.id}
          status="archived"
          label="Archive"
          icon={<ArchiveIcon />}
          compact={compact}
        />
      ) : null}
      {submission.status !== "spam" ? (
        <StatusButton
          id={submission.id}
          status="spam"
          label="Spam"
          icon={<SpamIcon />}
          compact={compact}
        />
      ) : null}
      <form action={deleteSubmissionAction}>
        <input type="hidden" name="id" value={submission.id} />
        <button type="submit" className={compact ? btnIcon : btnDanger} aria-label="Delete">
          <TrashIcon />
          {compact ? null : "Delete"}
        </button>
      </form>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  icon,
  compact,
}: {
  id: string;
  status: string;
  label: string;
  icon: ReactNode;
  compact: boolean;
}) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={compact ? btnIcon : btnToolbar}
        aria-label={label}
        title={label}
      >
        {icon}
        {compact ? null : label}
      </button>
    </form>
  );
}

function firstPreview(data: Record<string, unknown>): string {
  for (const value of Object.values(data)) {
    const text = String(value).trim();
    if (text) return text.slice(0, 80);
  }
  return "";
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
