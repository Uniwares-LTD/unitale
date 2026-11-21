"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { mediaState } from "@/lib/design-helpers";
import { cn } from "@/lib/utils";

/** Missing or failed media (spec §8): real text in the image's box, never a broken icon. */
export function MediaFallback({
  reason,
  aspectRatio,
  className,
}: {
  reason: "missing" | "failed";
  aspectRatio?: string;
  className?: string;
}) {
  const translate = useTranslations("ui");
  return (
    <div
      data-slot="media-fallback"
      data-reason={reason}
      style={aspectRatio ? { aspectRatio } : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      <ImageOff aria-hidden="true" className="size-6" />
      <p>
        {reason === "missing"
          ? translate("m7817cd065631")
          : translate("m94d866bf22ae")}
      </p>
    </div>
  );
}

/** `next/image` that falls back to MediaFallback when there is no source or it fails to load. */
export function ResultImage({
  src,
  alt,
  aspectRatio,
  className,
  ...props
}: Omit<ImageProps, "src" | "onError"> & {
  src: ImageProps["src"] | null | undefined;
  aspectRatio?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<ImageProps["src"] | null>(null);
  const failed = failedSrc !== null && failedSrc === src;
  const state = mediaState(
    typeof src === "string" ? src : src ? "static" : null,
    failed,
  );
  if (state !== "image" || !src)
    return (
      <MediaFallback
        reason={state === "failed" ? "failed" : "missing"}
        aspectRatio={aspectRatio}
        className={className}
      />
    );
  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
