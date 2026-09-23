"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";

const TABS = [
  { slug: "", label: "Submissions" },
  { slug: "edit", label: "Edit" },
  { slug: "share", label: "Share" },
  { slug: "settings", label: "Settings" },
] as const;

export function FormTabs({ formId }: { formId: string }) {
  const pathname = usePathname();
  const base = `/forms/${formId}`;

  return (
    <nav aria-label="Form" className="-mb-px flex gap-5 overflow-x-auto">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 pb-3 text-sm whitespace-nowrap no-underline",
              active
                ? "border-flare font-medium text-ink dark:text-mist"
                : "border-transparent text-neutral-500 hover:text-ink dark:hover:text-mist",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
