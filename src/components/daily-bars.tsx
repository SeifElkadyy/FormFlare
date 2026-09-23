import { DAY_MS, type DailyPoint } from "@/lib/insights/form";
import { hintClass } from "@/lib/ui";

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (day: number) => dateFmt.format(new Date(day * DAY_MS));

/**
 * One series, so no legend: the card title names it. Each bar's hover target is the
 * full column, not just the mark. The chart is hidden from assistive tech and keyboard
 * focus; the table below carries every value instead (30 tab stops would be worse, and
 * Flare is under 3:1 on white, so the numbers must not depend on the bars anyway).
 */
export function DailyBars({ days }: { days: DailyPoint[] }) {
  const max = Math.max(1, ...days.map((d) => d.submissions));
  return (
    <>
      <div className="relative mt-4">
        <span className={`${hintClass} absolute -top-1 left-0`}>{max}</span>
        <div
          className="flex h-28 items-end gap-[2px] border-b border-neutral-200 pt-4 dark:border-neutral-700"
          aria-hidden
        >
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t-[4px] bg-flare group-hover:opacity-80"
                style={{ height: d.submissions ? `${(d.submissions / max) * 100}%` : 0 }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-mist group-hover:block dark:bg-mist dark:text-ink">
                <strong className="tabular-nums">{d.submissions}</strong> · {dayLabel(d.day)}
                {d.views ? ` · ${d.views} views` : ""}
              </span>
            </div>
          ))}
        </div>
        <div className={`${hintClass} mt-1 flex justify-between`}>
          <span>{dayLabel(days[0].day)}</span>
          <span>{dayLabel(days[days.length - 1].day)}</span>
        </div>
      </div>
      <details className="mt-3">
        <summary className={`${hintClass} cursor-pointer`}>Show as table</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Submissions</th>
              <th className="py-1 text-right font-medium">Views</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-1">{dayLabel(d.day)}</td>
                <td className="py-1 text-right tabular-nums">{d.submissions}</td>
                <td className="py-1 text-right tabular-nums">{d.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
