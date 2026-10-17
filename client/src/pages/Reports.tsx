import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  TrendingUp,
  ArrowDownLeft,
  Wallet,
  BarChart3,
  LoaderCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnyRow } from '../types';
import { Header, Metric, Mini } from '../components/common';
import { money } from '../lib/format';
import { exportRows } from '../lib/export';

function localDateInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function rangeForPeriod(period: string) {
  const end = new Date();
  const start = new Date(end);
  if (period === 'Jour') start.setHours(0, 0, 0, 0);
  else if (period === 'Semaine') {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === 'Année') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { from: localDateInput(start), to: localDateInput(end) };
}

export default function Reports({
  fuels,
  req,
}: {
  fuels: AnyRow[];
  req: (path: string, init?: RequestInit) => Promise<any>;
}) {
  const [period, setPeriod] = useState('Mois');
  const initialRange = rangeForPeriod('Mois');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [items, setItems] = useState<Record<string, AnyRow[]>>({
    ventes: [],
    achats: [],
    depenses: [],
  });
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const currency = 'USD';
  const converted = (operation: AnyRow) => Number(operation.montantUSD ?? operation.montant);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ de: from, a: to });
    setReportLoading(true);
    setReportError('');
    void req(`/rapports?${params.toString()}`)
      .then((result) => {
        if (!active) return;
        setItems({ ventes: result.ventes, achats: result.achats, depenses: result.depenses });
      })
      .catch((error: unknown) => {
        if (active) setReportError(error instanceof Error ? error.message : 'Rapport indisponible.');
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [req, from, to]);
  const report = useMemo(() => {
    const salesByFuel = new Map<string, number>();
    const purchasesByFuel = new Map<string, number>();
    const dailyProfit = new Map<string, number>();
    let sales = 0;
    let purchase = 0;
    let expenses = 0;
    let grossProfit = 0;

    for (const sale of items.ventes) {
      const amount = converted(sale);
      const profit = Number(sale.beneficeUSD ?? amount - Number(sale.coutTotalUSD ?? 0));
      sales += amount;
      grossProfit += profit;
      salesByFuel.set(sale.carburantId, (salesByFuel.get(sale.carburantId) ?? 0) + amount);
      const day = new Date(sale.date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
      });
      dailyProfit.set(day, (dailyProfit.get(day) ?? 0) + profit);
    }

    for (const purchaseRow of items.achats) {
      const amount = converted(purchaseRow);
      purchase += amount;
      purchasesByFuel.set(
        purchaseRow.carburantId,
        (purchasesByFuel.get(purchaseRow.carburantId) ?? 0) + amount,
      );
    }
    for (const expense of items.depenses) {
      const amount = converted(expense);
      expenses += amount;
      const day = new Date(expense.date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
      });
      dailyProfit.set(day, (dailyProfit.get(day) ?? 0) - amount);
    }

    return {
      sales,
      purchase,
      expenses,
      grossProfit,
      netProfit: grossProfit - expenses,
      trendData: Array.from(dailyProfit, ([date, benefice]) => ({ date, benefice })),
      fuelData: fuels.map((fuel) => ({
        name: fuel.nom,
        ventes: salesByFuel.get(fuel.id) ?? 0,
        achats: purchasesByFuel.get(fuel.id) ?? 0,
      })),
    };
  }, [items, fuels]);
  const { sales, purchase, expenses, grossProfit, netProfit, trendData, fuelData: data } = report;
  return (
    <>
      <Header
        eyebrow="Analyse financière"
        title="Rapports"
        subtitle="Analysez les performances et exportez vos résultats."
        action={
          <button
            onClick={async () => {
              if (pdfLoading) return;
              setPdfLoading(true);
              setPdfError('');
              try {
              const { default: JsPDF } = await import('jspdf');
              const doc = new JsPDF();
              doc.text('Rapport de performance — PétroGest', 14, 18);
              const rows = [
                ['Chiffre d’affaires', money(sales, currency)],
                ['Achats', money(purchase, currency)],
                ['Dépenses', money(expenses, currency)],
                ['Bénéfice brut', money(grossProfit, currency)],
                ['Bénéfice net', money(netProfit, currency)],
              ];
              rows.forEach(([label, amount], index) => {
                const y = 32 + index * 12;
                doc.text(label, 14, y);
                doc.text(amount, 196, y, { align: 'right' });
                doc.setDrawColor(226, 232, 240);
                doc.line(14, y + 4, 196, y + 4);
              });
              doc.save('rapport-petrog-est.pdf');
              } catch {
                setPdfError('Le rapport PDF n’a pas pu être généré. Réessayez.');
              } finally {
                setPdfLoading(false);
              }
            }}
            disabled={pdfLoading}
            aria-busy={pdfLoading || undefined}
            className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {pdfLoading ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <Download size={15} />
            )}
            {pdfLoading ? 'Génération du PDF…' : 'Export PDF'}
          </button>
        }
      />
      {pdfError && (
        <p className="-mt-4 mb-5 text-xs text-rose-700" role="alert">
          {pdfError}
        </p>
      )}
      <div className="mb-5 flex flex-wrap gap-2">
        {['Jour', 'Semaine', 'Mois', 'Année', 'Personnalisée'].map((x) => (
          <button
            onClick={() => {
              setPeriod(x);
              if (x !== 'Personnalisée') {
                const range = rangeForPeriod(x);
                setFrom(range.from);
                setTo(range.to);
              }
            }}
            className={`rounded-lg px-3.5 py-2 text-[11px] font-semibold ${period === x ? 'bg-blue-600 text-white' : 'border border-line bg-white text-muted'}`}
            key={x}
          >
            {x}
          </button>
        ))}
        {period === 'Personnalisée' && (
          <>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-lg border border-line px-3 text-xs"
              aria-label="Début de la période"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-lg border border-line px-3 text-xs"
              aria-label="Fin de la période"
            />
          </>
        )}
      </div>
      {reportLoading && (
        <div className="mb-4 flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
          <LoaderCircle size={14} className="animate-spin" /> Chargement du rapport…
        </div>
      )}
      {reportError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
          {reportError}
        </p>
      )}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Chiffre d’affaires"
          value={money(sales, currency)}
          change="Période"
          icon={TrendingUp}
          foot={period.toLowerCase()}
        />
        <Metric
          label="Achats carburant"
          value={money(purchase, currency)}
          change="Période"
          icon={ArrowDownLeft}
          tone="purple"
          foot={period.toLowerCase()}
        />
        <Metric
          label="Bénéfice brut"
          value={money(grossProfit, currency)}
          change="Ventes moins coût vendu"
          icon={BarChart3}
          tone="blue"
          foot={period.toLowerCase()}
        />
        <Metric
          label="Dépenses"
          value={money(expenses, currency)}
          change="Période"
          icon={Wallet}
          tone="orange"
          foot={period.toLowerCase()}
        />
        <Metric
          label="Bénéfice net"
          value={money(netProfit, currency)}
          change="Période"
          icon={BarChart3}
          tone="green"
          foot={period.toLowerCase()}
        />
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="title mb-5 text-[15px] font-bold">Ventes et achats par carburant</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid stroke="#edf1f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(x: any) => money(x, currency)} />
                <Legend />
                <Bar dataKey="ventes" fill="#4169e1" radius={[5, 5, 0, 0]} />
                <Bar dataKey="achats" fill="#a5b4fc" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="title mb-5 text-[15px] font-bold">Bénéfices sur la période</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <CartesianGrid stroke="#edf1f6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(x: any) => money(x, currency)} />
                <Area
                  dataKey="benefice"
                  name="Bénéfice net"
                  stroke="#12a87c"
                  fill="#12a87c"
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="title text-[15px] font-bold">Détail financier</h2>
          <button
            onClick={() =>
              exportRows([...items.ventes, ...items.achats, ...items.depenses], 'rapport')
            }
            className="flex items-center gap-2 text-xs font-semibold text-blue-600"
          >
            <FileSpreadsheet size={15} /> Excel
          </button>
        </div>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
          <Mini label="Ventes" value={money(sales, currency)} />
          <Mini label="Achats" value={money(purchase, currency)} />
          <Mini label="Dépenses" value={money(expenses, currency)} />
          <Mini label="Bénéfice brut" value={money(grossProfit, currency)} />
          <Mini label="Résultat net" value={money(netProfit, currency)} />
        </div>
      </section>
    </>
  );
}
