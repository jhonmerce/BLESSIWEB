import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Download,
  Droplets,
  MoreHorizontal,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnyRow } from '../types';
import { Header, Metric } from '../components/common';
import { money, nfmt, dt } from '../lib/format';

const palette = ['#4169e1', '#9168e8', '#f3a522', '#12a87c', '#ef6672', '#4d9bd6'];
export default function Dashboard({
  dash,
  fuels,
  items,
}: {
  dash: AnyRow;
  fuels: AnyRow[];
  items: Record<string, AnyRow[]>;
}) {
  const catsData: AnyRow[] = useMemo(() => Object.values(
    ((dash.depensesCategories || []) as AnyRow[]).reduce((groups: AnyRow, expense: AnyRow) => {
      const name = expense.categorie?.nom || 'Autres';
      groups[name] ??= { name, value: 0 };
      groups[name].value += Number(expense.montantUSD ?? expense.montant);
      return groups;
    }, {}),
  ) as AnyRow[], [dash.depensesCategories]);
  const salesByDay = useMemo(() => Object.values(
    ((dash.ventes || []) as AnyRow[]).reduce((groups: AnyRow, sale: AnyRow) => {
      const day = new Date(sale.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      groups[day] ??= { date: day, sales: 0 };
      groups[day].sales += Number(sale.montantUSD ?? sale.montant);
      return groups;
    }, {}),
  ) as AnyRow[], [dash.ventes]);
  return (
    <>
      <Header
        eyebrow="Vue d’ensemble"
        title="Bonjour, administrateur 👋"
        subtitle="Voici la situation de votre station aujourd’hui."
        action={
          <button className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-white shadow-sm">
            <Download size={15} /> Exporter le rapport
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Chiffre d’affaires"
          value={money(Number(dash.revenu ?? 0), dash.devise || 'USD')}
          change="Aujourd\u2019hui"
          icon={TrendingUp}
          foot="Aujourd\u2019hui"
        />
        <Metric
          label="Dépenses du jour"
          value={money(Number(dash.depenses ?? 0), dash.devise || 'USD')}
          change="Aujourd\u2019hui"
          icon={Wallet}
          tone="orange"
          foot="Aujourd\u2019hui"
        />
        <Metric
          label="Bénéfice net"
          value={money(Number(dash.benefice ?? 0), dash.devise || 'USD')}
          change="Aujourd\u2019hui"
          icon={BarChart3}
          tone="green"
          foot="Aujourd\u2019hui"
        />
        <Metric
          label="Stock disponible"
          value={`${nfmt(Number(dash.stockTotal ?? 0))} L`}
          change={`${fuels.length} types`}
          icon={Droplets}
          tone="purple"
          foot="de carburant"
        />
        <Metric
          label="Volume total acheté"
          value={`${nfmt(Number(dash.achatsLitres ?? 0))} L`}
          change="Cumul des achats"
          icon={ArrowDownLeft}
          tone="blue"
          foot="non diminué par les ventes"
        />
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h2 className="title text-[15px] font-bold text-ink">Évolution des ventes</h2>
              <p className="mt-1 text-[11px] text-muted">Performance de vos ventes cette semaine</p>
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[11px] text-muted">
              7 derniers jours <ChevronDown size={13} />
            </button>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesByDay} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4169e1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4169e1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#edf1f6" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#8b98aa' }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8b98aa' }} />
                <Tooltip formatter={(v: any) => money(v, dash.devise || 'USD')} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Ventes"
                  stroke="#4169e1"
                  strokeWidth={2.5}
                  fill="url(#salesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-soft md:p-6">
          <div className="mb-3">
            <h2 className="title text-[15px] font-bold text-ink">Dépenses par catégorie</h2>
            <p className="mt-1 text-[11px] text-muted">Répartition de ce mois</p>
          </div>
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={catsData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={78}
                  paddingAngle={4}
                  stroke="none"
                >
                  {catsData.map((_: any, i: number) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => money(v, dash.devise || 'USD')} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="title text-xl font-extrabold text-ink">
                {money(catsData.reduce((n: number, x: AnyRow) => n + x.value, 0), dash.devise || 'USD')}
              </div>
              <div className="text-[10px] text-muted">Total dépenses</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            {catsData.slice(0, 4).map((x: AnyRow, i: number) => (
              <div className="flex items-center gap-2 text-[10px] text-muted" key={x.name}>
                <span className="h-2 w-2 rounded-full" style={{ background: palette[i] }} />
                {x.name}
                <b className="ml-auto text-ink">
                  {Math.round(
                    (x.value /
                      Math.max(
                        1,
                        catsData.reduce((n: number, c: AnyRow) => n + c.value, 0),
                      )) *
                      100,
                  )}
                  %
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="title text-[15px] font-bold text-ink">Niveau des stocks</h2>
              <p className="mt-1 text-[11px] text-muted">État actuel par type de carburant</p>
            </div>
            <Link className="text-[11px] font-semibold text-blue-600" to="/stocks">
              Voir les stocks →
            </Link>
          </div>
          <div className="space-y-5">
            {fuels.map((x) => (
              <div key={x.id}>
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-ink">{x.nom}</span>
                  <span className="text-muted">
                    {nfmt(Number(x.stock))} L
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (Number(x.stock) / Math.max(1, ...fuels.map((fuel) => Number(fuel.stock)))) * 100)}%`,
                      background: x.couleur,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="title text-[15px] font-bold text-ink">Opérations récentes</h2>
              <p className="mt-1 text-[11px] text-muted">Dernières activités de la station</p>
            </div>
            <button className="text-muted">
              <MoreHorizontal size={19} />
            </button>
          </div>
          <div className="space-y-4">
            {[
              ...items.ventes.slice(0, 2).map((x) => ({ ...x, type: 'Vente' }) as AnyRow),
              ...items.achats.slice(0, 1).map((x) => ({ ...x, type: 'Achat' }) as AnyRow),
              ...items.depenses.slice(0, 1).map((x) => ({ ...x, type: 'Dépense' }) as AnyRow),
            ]
              .slice(0, 4)
              .map((x, i) => (
                <div className="flex items-center gap-3" key={x.id}>
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-xl ${x.type === 'Vente' ? 'bg-emerald-50 text-emerald-600' : x.type === 'Achat' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}
                  >
                    {x.type === 'Vente' ? (
                      <ArrowUpRight size={16} />
                    ) : x.type === 'Achat' ? (
                      <ArrowDownLeft size={16} />
                    ) : (
                      <Receipt size={16} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-ink">
                      {x.type} · {x.carburant?.nom || x.categorie?.nom || x.description}
                    </div>
                    <div className="mt-1 text-[10px] text-muted">{dt(x.date)}</div>
                  </div>
                  <span
                    className={`text-[11px] font-bold ${x.type === 'Dépense' ? 'text-rose-500' : 'text-ink'}`}
                  >
                    {x.type === 'Dépense' ? '−' : '+'}
                    {money(Number(x.montantUSD ?? x.montant), 'USD')}
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}
