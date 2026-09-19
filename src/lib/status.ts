export type BookingStatus = 'CONFIRMED' | 'TENTATIVE' | 'COMPLETED' | 'CANCELLED';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; chip: string }> = {
  CONFIRMED: { label: '確定', chip: 'border-emerald-200 bg-emerald-100 text-emerald-800' },
  TENTATIVE: { label: '仮押さえ', chip: 'border-amber-300 bg-amber-100 text-amber-900' },
  COMPLETED: { label: '実施済', chip: 'border-slate-200 bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'キャンセル', chip: 'border-red-200 bg-red-100 text-red-700' },
};

export function statusOf(value: string): { label: string; chip: string } {
  return BOOKING_STATUS[value as BookingStatus] ?? BOOKING_STATUS.CONFIRMED;
}
