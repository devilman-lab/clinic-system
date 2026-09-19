/** 時刻・日付の純粋ユーティリティ。全て「分」と「YYYY-MM-DD」を基準に扱う。 */

export const MINUTES_IN_DAY = 24 * 60;

export interface TimeRange {
  start: number;
  end: number;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function toTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** ローカルタイムの YYYY-MM-DD。DB の DateTime とUI表示の橋渡しに使う。 */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 月内の第N週。第2金曜/第4金曜の判定に使う。 */
export function weekOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  let cursor = startOfDay(from);
  const last = startOfDay(to);
  while (cursor <= last) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** 重なり合う時間帯を結合して、連続した空き時間の計算を正しくする。 */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: TimeRange[] = [{ ...sorted[0] }];
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** base から blockers を差し引いた残りの区間。 */
export function subtractRanges(base: TimeRange, blockers: TimeRange[]): TimeRange[] {
  const relevant = mergeRanges(blockers.filter((b) => overlaps(base, b)));
  const remaining: TimeRange[] = [];
  let cursor = base.start;
  for (const blocker of relevant) {
    if (blocker.start > cursor) {
      remaining.push({ start: cursor, end: Math.min(blocker.start, base.end) });
    }
    cursor = Math.max(cursor, blocker.end);
    if (cursor >= base.end) break;
  }
  if (cursor < base.end) {
    remaining.push({ start: cursor, end: base.end });
  }
  return remaining.filter((r) => r.end > r.start);
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export function weekdayLabel(date: Date): string {
  return WEEKDAY_LABELS[date.getDay()];
}

export function formatDateJa(date: Date): string {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}（${weekdayLabel(date)}）`;
}
