"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { btnToolbar } from "@/lib/ui";

/**
 * Copy feedback is the label and colour, not motion. High-frequency action:
 * instant, interruptible, still obvious with reduced motion.
 */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      className={`${btnToolbar} ${copied ? "text-emerald-700 dark:text-emerald-300" : ""}`}
      onClick={copy}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </button>
  );
}
