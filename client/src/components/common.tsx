import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export function LoadingState({ label = 'Chargement des données…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="animate-spin text-blue-600" size={20} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function SavingLabel({ saving, children }: { saving: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {saving && <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />}
      {saving ? 'Enregistrement…' : children}
    </span>
  );
}

export function Header({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-blue-600">
          {eyebrow}
        </div>
        <h1 className="title text-[25px] font-extrabold text-ink md:text-[30px]">{title}</h1>
        <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function Metric({
  label,
  value,
  change,
  icon: Icon,
  tone = 'blue',
  foot,
}: {
  label: string;
  value: string;
  change: string;
  icon: any;
  tone?: string;
  foot: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-amber-50 text-amber-600',
    purple: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="text-[12px] font-medium text-muted">{label}</div>
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${colors[tone]}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className="title mt-4 text-[25px] font-extrabold tracking-tight text-ink">{value}</div>
      <div className="mt-2 flex items-center gap-1 text-[10px]">
        <span className="font-bold text-emerald-600">{change}</span>
        <span className="text-muted">{foot}</span>
      </div>
    </div>
  );
}

export function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5">
      <div className="text-[10px] font-medium text-muted">{label}</div>
      <div className="title mt-1 text-lg font-bold text-ink">{value}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-ink">
      {label}
      <div className="mt-1.5 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-line [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-xs [&_input]:font-normal [&_input]:outline-none [&_input]:focus:border-blue-400 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-line [&_select]:bg-white [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-xs [&_select]:font-normal">
        {children}
      </div>
    </label>
  );
}
