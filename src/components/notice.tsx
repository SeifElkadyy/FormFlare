import type { ReactNode } from "react";
import { alertClass, infoClass, successClass } from "@/lib/ui";

const TONE = {
  info: infoClass,
  warning: alertClass,
  success: successClass,
} as const;

export function Notice({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <p className={TONE[tone]}>{children}</p>;
}
