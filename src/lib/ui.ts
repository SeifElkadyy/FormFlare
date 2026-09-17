export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const press =
  "press inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium disabled:opacity-50";

export const labelClass = "block text-sm font-medium text-neutral-800 dark:text-neutral-200";

export const hintClass = "text-xs tabular-nums text-neutral-500 dark:text-neutral-400";

export const sectionTitle = "text-[13px] font-medium text-neutral-500";

export const inputClass =
  "h-9 w-full rounded-lg bg-white px-3 text-sm text-neutral-900 shadow-[var(--shadow-border)] outline-none placeholder:text-neutral-400 focus-visible:shadow-[0_0_0_1px_#0b57d0] dark:bg-neutral-800 dark:text-neutral-100";

export const selectClass = inputClass;

export const textareaClass =
  "w-full rounded-lg bg-white px-3 py-2 text-sm text-neutral-900 shadow-[var(--shadow-border)] outline-none placeholder:text-neutral-400 focus-visible:shadow-[0_0_0_1px_#0b57d0] dark:bg-neutral-800 dark:text-neutral-100";

/** Trailing-icon primary (optical: 2px less on the icon side). */
export const btnPrimary =
  `${press} h-9 rounded-lg bg-blue-600 ps-4 pe-3.5 text-sm text-white hover:bg-blue-700`;

/** Leading-icon primary. */
export const btnPrimaryLead =
  `${press} h-9 rounded-lg bg-blue-600 ps-3.5 pe-4 text-sm text-white hover:bg-blue-700`;

export const btnSecondary =
  `${press} surface h-9 rounded-lg bg-white ps-4 pe-3.5 text-sm text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100`;

export const btnGhost =
  `${press} h-8 rounded-lg px-3 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`;

export const btnDanger =
  `${press} h-8 rounded-lg bg-white px-3 text-xs text-red-700 shadow-[var(--shadow-border)] hover:bg-red-50 dark:bg-neutral-900 dark:text-red-400`;

export const btnToolbar =
  `${press} h-8 rounded-lg bg-white px-2.5 text-xs text-neutral-700 shadow-[var(--shadow-border)] dark:bg-neutral-800 dark:text-neutral-200`;

export const btnIcon =
  `${press} h-8 w-8 rounded-lg bg-white text-neutral-600 shadow-[var(--shadow-border)] dark:bg-neutral-800 dark:text-neutral-200`;

export const cardClass =
  "rounded-xl bg-white p-5 shadow-[var(--shadow-border)] dark:bg-neutral-900";

export const authCardClass =
  "w-full rounded-2xl bg-white p-6 shadow-[var(--shadow-border)] dark:bg-neutral-900";

export const emptyClass =
  "flex flex-1 items-center justify-center px-6 py-20 text-center text-sm leading-6 text-neutral-500";

export const alertClass =
  "rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";

export const infoClass =
  "rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100";

export const successClass =
  "rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";

export const segmentTrack =
  "flex h-8 items-center rounded-xl bg-neutral-100 p-0.5 dark:bg-neutral-800";

export const codeBlockClass =
  "block overflow-x-auto rounded-lg bg-[#eef3fb] p-3 font-mono text-xs break-all text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200";

export const errorClass = "text-sm text-red-700 dark:text-red-400";

export const pillClass =
  "rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium tabular-nums text-blue-700 dark:bg-blue-950 dark:text-blue-200";
