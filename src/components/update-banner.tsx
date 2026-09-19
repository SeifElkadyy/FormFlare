"use client";

import { useCallback, useSyncExternalStore } from "react";
import { btnSecondary } from "@/lib/ui";

const STORAGE_KEY = "formflare-update-dismissed";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function UpdateBanner({
  latest,
  htmlUrl,
}: {
  latest: string;
  htmlUrl: string | null;
}) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY),
    () => latest,
  );
  const visible = dismissed !== latest;

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, latest);
    window.dispatchEvent(new Event("storage"));
  }, [latest]);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-flare/20 bg-flare-soft px-4 py-2 text-sm text-ink dark:text-mist">
      <p>
        FormFlare {latest} is available.{" "}
        <a href="/settings#updates" className="font-medium underline">
          Check for updates
        </a>
        {htmlUrl ? (
          <>
            {" "}
            or{" "}
            <a href={htmlUrl} className="font-medium underline" rel="noreferrer">
              read the notes
            </a>
          </>
        ) : null}
        .
      </p>
      <button type="button" className={`${btnSecondary} h-7 px-2.5 text-xs`} onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}
