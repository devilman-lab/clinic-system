/**
 * 医師ごとの配色。
 * Tailwind はクラス名を静的に解析するため、文字列を組み立てず定数で持つ。
 */

export interface DoctorPalette {
  chip: string;
  card: string;
  bar: string;
  dot: string;
  label: string;
}

const PALETTES: Record<string, DoctorPalette> = {
  sky: {
    chip: 'bg-sky-100 text-sky-800 border-sky-200',
    card: 'bg-sky-50 border-sky-300 hover:border-sky-400',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
    label: 'text-sky-700',
  },
  emerald: {
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    card: 'bg-emerald-50 border-emerald-300 hover:border-emerald-400',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    label: 'text-emerald-700',
  },
  violet: {
    chip: 'bg-violet-100 text-violet-800 border-violet-200',
    card: 'bg-violet-50 border-violet-300 hover:border-violet-400',
    bar: 'bg-violet-500',
    dot: 'bg-violet-500',
    label: 'text-violet-700',
  },
  amber: {
    chip: 'bg-amber-100 text-amber-900 border-amber-200',
    card: 'bg-amber-50 border-amber-300 hover:border-amber-400',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    label: 'text-amber-700',
  },
  rose: {
    chip: 'bg-rose-100 text-rose-800 border-rose-200',
    card: 'bg-rose-50 border-rose-300 hover:border-rose-400',
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
    label: 'text-rose-700',
  },
  slate: {
    chip: 'bg-slate-100 text-slate-700 border-slate-200',
    card: 'bg-slate-50 border-slate-300 hover:border-slate-400',
    bar: 'bg-slate-400',
    dot: 'bg-slate-400',
    label: 'text-slate-600',
  },
};

export const DOCTOR_COLOR_TOKENS = ['sky', 'emerald', 'violet', 'amber', 'rose', 'slate'] as const;

export function palette(token: string | null | undefined): DoctorPalette {
  return PALETTES[token ?? 'slate'] ?? PALETTES.slate;
}
