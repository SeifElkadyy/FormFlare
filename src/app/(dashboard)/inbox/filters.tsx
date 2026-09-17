"use client";

/**
 * Inbox filters.
 *
 * A plain GET form, so filters live in the URL: shareable, bookmarkable, and they
 * survive a reload. It also means the whole thing works without JavaScript.
 */
export function InboxFilters({
  forms,
  current,
}: {
  forms: { id: string; name: string }[];
  current: Record<string, string | undefined>;
}) {
  return (
    <form
      method="GET"
      action="/inbox"
      role="search"
      aria-label="Filter submissions"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
    >
      <div className="min-w-48 flex-1 space-y-1">
        <label htmlFor="q" className="block text-sm font-medium">
          Search
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={current.q ?? ""}
          placeholder="Email or message text"
          className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="form" className="block text-sm font-medium">
          Form
        </label>
        <select
          id="form"
          name="form"
          defaultValue={current.form ?? ""}
          className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
        >
          <option value="">All forms</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="status" className="block text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={current.status ?? ""}
          className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
        >
          <option value="">Any</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="archived">Archived</option>
          <option value="spam">Spam</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="from" className="block text-sm font-medium">
          From
        </label>
        <input
          id="from"
          name="from"
          type="date"
          defaultValue={current.from ?? ""}
          className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="to" className="block text-sm font-medium">
          To
        </label>
        <input
          id="to"
          name="to"
          type="date"
          defaultValue={current.to ?? ""}
          className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
        />
      </div>

      <button
        type="submit"
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Apply
      </button>

      <a
        href="/inbox"
        className="text-sm text-zinc-600 underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-zinc-400"
      >
        Clear
      </a>
    </form>
  );
}
