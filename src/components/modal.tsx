"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-neutral-900 shadow-[var(--shadow-border),0_16px_40px_oklch(0_0_0_/_0.08)] dark:bg-neutral-900 dark:text-neutral-100"
      onClose={onClose}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-neutral-500">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="px-5 pt-4 pb-5">{children}</div>
    </dialog>
  );
}
