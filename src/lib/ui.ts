export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const press =
  "press inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium disabled:opacity-50";

export const labelClass = "block text-sm font-medium text-ink dark:text-mist";

export const hintClass = "text-xs tabular-nums text-slate";

export const sectionTitle = "text-[13px] font-medium text-slate";

export const inputClass =
  "h-9 w-full rounded-lg bg-white px-3 text-sm text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-slate focus-visible:shadow-[0_0_0_1px_var(--flare)] dark:bg-ink dark:text-mist";

export const selectClass = inputClass;

export const textareaClass =
  "w-full rounded-lg bg-white px-3 py-2 text-sm text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-slate focus-visible:shadow-[0_0_0_1px_var(--flare)] dark:bg-ink dark:text-mist";

/** Trailing-icon primary (optical: 2px less on the icon side). */
export const btnPrimary =
  `${press} h-9 rounded-lg bg-flare ps-4 pe-3.5 text-sm text-ink hover:bg-flare-hover`;

/** Leading-icon primary. */
export const btnPrimaryLead =
  `${press} h-9 rounded-lg bg-flare ps-3.5 pe-4 text-sm text-ink hover:bg-flare-hover`;

export const btnSecondary =
  `${press} surface h-9 rounded-lg bg-white ps-4 pe-3.5 text-sm text-ink dark:bg-[#161616] dark:text-mist`;

export const btnGhost =
  `${press} h-8 rounded-lg px-3 text-xs text-slate hover:bg-mist hover:text-ink dark:hover:bg-[#1f1f1f] dark:hover:text-mist`;

export const btnDanger =
  `${press} h-8 rounded-lg bg-white px-3 text-xs text-red-700 shadow-[var(--shadow-border)] hover:bg-red-50 dark:bg-[#161616] dark:text-red-400`;

export const btnToolbar =
  `${press} h-8 rounded-lg bg-white px-2.5 text-xs text-ink shadow-[var(--shadow-border)] dark:bg-[#161616] dark:text-mist`;

export const btnIcon =
  `${press} h-8 w-8 rounded-lg bg-white text-slate shadow-[var(--shadow-border)] dark:bg-[#161616] dark:text-mist`;

export const cardClass =
  "rounded-xl bg-white p-5 shadow-[var(--shadow-border)] dark:bg-[#161616]";

export const authCardClass =
  "w-full rounded-2xl bg-white p-6 shadow-[var(--shadow-border)] dark:bg-[#161616]";

export const emptyClass =
  "flex flex-1 items-center justify-center px-6 py-20 text-center text-sm leading-6 text-slate";

export const alertClass =
  "rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";

export const infoClass =
  "rounded-xl bg-flare-soft px-3 py-2 text-xs leading-5 text-ink dark:text-mist";

export const successClass =
  "rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";

export const segmentTrack =
  "flex h-8 items-center rounded-xl bg-mist p-0.5 dark:bg-[#1f1f1f]";

export const codeBlockClass =
  "block overflow-x-auto rounded-lg bg-mist p-3 font-mono text-xs break-all text-ink dark:bg-ink dark:text-mist";

export const errorClass = "text-sm text-red-700 dark:text-red-400";

export const pillClass =
  "rounded-full bg-flare-soft px-2.5 py-1 text-xs font-medium tabular-nums text-ink dark:text-mist";
