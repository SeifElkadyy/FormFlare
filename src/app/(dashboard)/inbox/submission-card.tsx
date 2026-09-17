import { deleteSubmissionAction, setStatusAction } from "./actions";

interface Props {
  submission: {
    id: string;
    formName: string;
    email: string | null;
    dataJson: string;
    status: string;
    waitlistPosition: number | null;
    country: string | null;
    createdAt: number;
  };
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  read: "Read",
  archived: "Archived",
  spam: "Spam",
};

export function SubmissionCard({ submission }: Props) {
  const data = safeParse(submission.dataJson);
  const timestamp = new Date(submission.createdAt).toISOString().replace("T", " ").slice(0, 19);

  return (
    <li className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{submission.email ?? "(no email)"}</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {submission.formName}
          {submission.waitlistPosition !== null && ` · #${submission.waitlistPosition}`}
          {submission.status !== "new" && ` · ${STATUS_LABEL[submission.status]}`}
        </p>
      </div>

      <dl className="mt-2 space-y-1">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-xs">
            <dt className="shrink-0 text-zinc-600 dark:text-zinc-400">{key}</dt>
            {/* Rendered as text by React, so submitted HTML cannot execute. */}
            <dd className="break-all">{String(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          <time dateTime={new Date(submission.createdAt).toISOString()}>{timestamp} UTC</time>
          {submission.country && ` · ${submission.country}`}
        </p>

        {submission.status !== "read" && (
          <StatusButton id={submission.id} status="read" label="Mark read" />
        )}
        {submission.status !== "archived" && (
          <StatusButton id={submission.id} status="archived" label="Archive" />
        )}
        {submission.status !== "spam" && (
          <StatusButton id={submission.id} status="spam" label="Mark spam" />
        )}

        <form action={deleteSubmissionAction}>
          <input type="hidden" name="id" value={submission.id} />
          <button
            type="submit"
            className="text-xs text-red-600 underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
          >
            Delete
          </button>
        </form>
      </div>
    </li>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="text-xs text-zinc-600 underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-zinc-400"
      >
        {label}
      </button>
    </form>
  );
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
