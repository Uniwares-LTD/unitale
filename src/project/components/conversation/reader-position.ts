// Index zero is the cover. Keep it alone; subsequent spreads pair story pages.
export function readerRange(
  index: number,
  length: number,
  spread: boolean,
  hasCover = true,
) {
  if (length <= 0) return [];
  const current = Math.max(0, Math.min(index, length - 1));
  const offset = hasCover ? 1 : 0;
  const first =
    spread && current >= offset
      ? offset + Math.floor((current - offset) / 2) * 2
      : current;
  return spread && first >= offset && first + 1 < length
    ? [first, first + 1]
    : [first];
}

export function readerStep(
  index: number,
  length: number,
  spread: boolean,
  delta: -1 | 1,
  hasCover = true,
) {
  const range = readerRange(index, length, spread, hasCover);
  if (!range.length) return 0;
  if (delta > 0) return range.at(-1) === length - 1 ? index : range.at(-1)! + 1;
  return Math.max(0, range[0] - (spread && range[0] > 1 ? 2 : 1));
}
