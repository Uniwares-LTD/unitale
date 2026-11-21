export function scheduleToastExpiry(
  paused: boolean,
  duration: string,
  expire: () => void,
) {
  const milliseconds = Number(
    duration.trim().match(/^(\d+(?:\.\d+)?)ms$/)?.[1],
  );
  if (paused || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
  const timer = setTimeout(expire, milliseconds);
  return () => clearTimeout(timer);
}
