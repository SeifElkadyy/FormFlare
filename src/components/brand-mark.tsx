import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { FlameIcon } from "./icons";
import { cn } from "@/lib/ui";

export function BrandMark({
  href = "/",
  className,
  size = "md",
  iconOnly = false,
}: {
  href?: string;
  className?: string;
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-2 text-ink no-underline dark:text-mist",
        className,
      )}
      aria-label={`${BRAND.name} home`}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-flare text-ink",
          size === "sm" ? "size-6" : "size-7",
        )}
      >
        <FlameIcon />
      </span>
      {iconOnly ? null : (
        <span
          className={cn(
            "truncate font-semibold tracking-tight",
            size === "sm" ? "text-sm" : "text-base",
          )}
        >
          {BRAND.name}
        </span>
      )}
    </Link>
  );
}
