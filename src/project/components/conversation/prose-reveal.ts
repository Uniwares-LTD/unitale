"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(callback: () => void) {
  const media = matchMedia(reducedMotionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function wordGroups(text: string) {
  return text.match(/(?:\S+\s*){1,2}/gu) ?? [];
}

/** Reveal two words at a time, then briefly settle before showing the question. */
export function useProseReveal(key: string | null, groups: number) {
  const reduced = useSyncExternalStore(
    subscribeToMotion,
    () => matchMedia(reducedMotionQuery).matches,
    () => true,
  );
  const [finished, setFinished] = useState<string | null>(null);
  const [frame, setFrame] = useState({ key: "", count: 0 });
  const revealing = !!key && groups > 0 && !reduced && finished !== key;
  const count = revealing ? (frame.key === key ? frame.count : 0) : groups;

  useEffect(() => {
    if (!key || !revealing) return;
    let timer: ReturnType<typeof setTimeout>;
    const complete = () => {
      clearTimeout(timer);
      setFinished(key);
    };
    let shown = 0;
    const advance = () => {
      shown += 1;
      setFrame({ key, count: shown });
      timer = setTimeout(
        shown < groups ? advance : complete,
        shown < groups ? 90 : 180,
      );
    };
    timer = setTimeout(advance, 90);
    document.addEventListener("pointerdown", complete, { once: true });
    document.addEventListener("keydown", complete, { once: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", complete);
      document.removeEventListener("keydown", complete);
    };
  }, [key, groups, revealing]);

  return { count, revealing };
}
