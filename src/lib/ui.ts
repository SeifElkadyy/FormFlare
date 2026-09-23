/**
 * Shared class strings. One accent: Flare is for the primary action on a screen, the
 * logo, focus rings and charts. Everything else is ink, white and hairline gray, so the
 * one orange thing on a screen is the thing to do next.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const press =
  "press inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium disabled:opacity-50";

export const labelClass = "block text-sm font-medium text-ink dark:text-mist";

export const hintClass = "text-xs leading-5 text-neutral-500 dark:text-neutral-400";

export const sectionTitle = "text-sm font-semibold text-ink dark:text-mist";

/** Input look without a width, for inputs that size themselves (`w-48`, `flex-1`). */
export const inputBase =
  "h-9 rounded-lg bg-white px-3 text-sm text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-neutral-400 focus-visible:shadow-[0_0_0_2px_var(--flare)] dark:bg-neutral-900 dark:text-mist";

export const inputClass = `${inputBase} w-full`;

export const selectClass = inputClass;

export const textareaClass =
  "w-full rounded-lg bg-white px-3 py-2 text-sm text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-neutral-400 focus-visible:shadow-[0_0_0_2px_var(--flare)] dark:bg-neutral-900 dark:text-mist";

/** The one orange button on a screen. */
export const btnPrimary = `${press} h-9 rounded-lg bg-flare px-4 text-sm text-ink hover:bg-flare-hover`;

/** Same, with a leading icon. */
export const btnPrimaryLead = `${press} h-9 rounded-lg bg-flare ps-3 pe-4 text-sm text-ink hover:bg-flare-hover`;

export const btnSecondary = `${press} surface h-9 rounded-lg bg-white px-4 text-sm text-ink dark:bg-neutral-900 dark:text-mist`;

export const btnGhost = `${press} h-8 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-ink dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-mist`;

export const btnDanger = `${press} h-8 rounded-lg bg-white px-3 text-sm text-red-700 shadow-[var(--shadow-border)] hover:bg-red-50 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-950/40`;

export const btnToolbar = `${press} h-8 rounded-lg bg-white px-3 text-xs text-ink shadow-[var(--shadow-border)] dark:bg-neutral-900 dark:text-mist`;

export const btnIcon = `${press} h-8 w-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-ink dark:hover:bg-neutral-800 dark:hover:text-mist`;

export const cardClass =
  "rounded-xl bg-white p-5 shadow-[var(--shadow-border)] dark:bg-neutral-900";

export const authCardClass =
  "w-full rounded-2xl bg-white p-6 shadow-[var(--shadow-border)] dark:bg-neutral-900";

export const emptyClass =
  "flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center text-sm leading-6 text-neutral-500";

export const alertClass =
  "rounded-lg bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";

export const infoClass =
  "rounded-lg bg-neutral-100 px-3 py-2 text-sm leading-5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200";

export const successClass =
  "rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";

export const segmentTrack =
  "inline-flex h-8 items-center rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800";

/** An option inside `segmentTrack`. */
export function segmentItem(active: boolean): string {
  return cn(
    "flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium no-underline",
    active
      ? "bg-white text-ink shadow-[var(--shadow-border)] dark:bg-neutral-700 dark:text-mist"
      : "text-neutral-500 hover:text-ink dark:hover:text-mist",
  );
}

export const codeBlockClass =
  "block overflow-x-auto rounded-lg bg-neutral-50 p-3 font-mono text-xs break-all text-ink shadow-[var(--shadow-border)] dark:bg-neutral-950 dark:text-mist";

export const errorClass = "text-sm text-red-700 dark:text-red-400";

export const pillClass =
  "inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium tabular-nums text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200";

/** Native checkbox in the brand accent. */
export const checkboxClass = "size-4 accent-[var(--flare)]";
