import Image from "next/image";

import { cn } from "@/lib/utils";

export const MLAIR_LOGO_SRC = "/brand/mlair-logo-512.png";
export const MLAIR_LOGO_FULL_SRC = "/brand/mlair-logo.png";

type MlairLogoProps = {
  className?: string;
  /** Visual size preset for common surfaces. */
  size?: "sm" | "md" | "lg" | "hero";
  priority?: boolean;
  alt?: string;
  /** Keep official lockup readable on dark Hub chrome. */
  framed?: boolean;
};

const sizeClass: Record<NonNullable<MlairLogoProps["size"]>, string> = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  hero: "h-36 w-36 sm:h-40 sm:w-40",
};

/**
 * Official MLAir brand mark (cloud lockup with wordmark).
 * Prefer this over inventing icon placeholders in Hub chrome.
 */
export function MlairLogo({
  className,
  size = "md",
  priority = false,
  alt = "MLAir",
  framed = true,
}: MlairLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        framed && "rounded-lg bg-white p-0.5 shadow-xs",
        sizeClass[size],
        className,
      )}
    >
      <Image
        src={MLAIR_LOGO_SRC}
        alt={alt}
        width={512}
        height={512}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
