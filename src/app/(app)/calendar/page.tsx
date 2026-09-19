import { getCalendarData, rangeForView, resolveDefaultAnchor } from '@/lib/calendar';
import { getMasters } from '@/lib/masters';
import { dateKey, fromDateKey } from '@/lib/time';
import { CalendarClient } from './CalendarClient';

export const dynamic = 'force-dynamic';

type View = 'day' | 'week' | 'month';

function parseView(value: string | undefined): View {
  return value === 'day' || value === 'month' ? value : 'week';
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const view = parseView(params.view);

  const anchor =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? fromDateKey(params.date)
      : await resolveDefaultAnchor(new Date());

  const { from, to } = rangeForView(view, anchor);
  const [data, masters] = await Promise.all([getCalendarData(from, to), getMasters()]);

  return (
    <CalendarClient data={data} masters={masters} view={view} anchor={dateKey(anchor)} />
  );
}
