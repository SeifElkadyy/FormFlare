import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { FlameIcon } from "./icons";
import { cn } from "@/lib/ui";

export function BrandMark({
  href = "/",
  className,
  size = "md",
}: {
  href?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const icon = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const label = size === "sm" ? "text-lg" : "text-base";

  return (
    <Link
      href={href}
      className={cn("flex min-w-0 items-center gap-3 text-neutral-800 no-underline dark:text-neutral-100", className)}
      aria-label={`${BRAND.name} home`}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-flare text-ink",
          icon,
        )}
      >
        <FlameIcon />
      </span>
      <span className={cn("truncate font-semibold tracking-tight", label)}>{BRAND.name}</span>
    </Link>
  );
}
