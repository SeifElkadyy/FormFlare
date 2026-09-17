"use client";

import { useSyncExternalStore } from "react";

/** Never changes after hydration; the store only needs to report server vs client. */
const subscribe = () => () => {};

/**
 * Timestamp in the viewer's own timezone, with UTC in the tooltip.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState`: the server has no way to
 * know the viewer's timezone, so it renders UTC and the client renders local time. This
 * hook is React's supported way to return a different value on each side without a
 * hydration mismatch and without a second render pass.
 *
 * UTC stays in `title` because it is the unambiguous form — useful when comparing
 * against logs or talking to someone in another timezone.
 */
export function LocalTime({ timestamp }: { timestamp: number }) {
  const utc = new Date(timestamp).toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const label = useSyncExternalStore(
    subscribe,
    () =>
      new Date(timestamp).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    () => utc,
  );

  return (
    <time dateTime={new Date(timestamp).toISOString()} title={utc}>
      {label}
    </time>
  );
}
