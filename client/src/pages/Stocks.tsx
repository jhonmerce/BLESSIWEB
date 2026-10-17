import { Download } from 'lucide-react';
import type { AnyRow } from '../types';
import { Header, Mini } from '../components/common';
import { day, dt, money, nfmt } from '../lib/format';
import { exportRows } from '../lib/export';

export default function Stocks({
  fuels,
  items,
  movements,
}: {
  fuels: AnyRow[];
  items: Record<string, AnyRow[]>;
  movements: AnyRow[];
}) {
  const total = fuels.reduce((n, x) => n + Number(x.stock), 0),
    value = fuels.reduce((n, x) => n + Number(x.stock) * Number(x.prixVente), 0),
    moves: AnyRow[] = movements.map((movement) => {
      const isPurchase = movement.type === 'ACHAT';
      const isDriverTopUp = movement.type === 'APPROVISIONNEMENT_CHAUFFEUR';
      const operation = isPurchase
        ? items.achats.find((item) => item.id === movement.referenceId)
        : items.ventes.find((item) => item.id === movement.referenceId);
      return {
        ...movement,
        label: isPurchase
          ? 'Achat'
          : isDriverTopUp
            ? `Approvisionnement · ${movement.chauffeur?.nom ?? 'Chauffeur'}`
            : 'Vente comptant',
        montant: movement.montant ?? operation?.montant,
        entrant: isPurchase,
      };
    });
  return (
    <>
      <Header
        eyebrow="Inventaire et mouvements"
        title="Gestion des stocks"
        subtitle="Suivez les quantités disponibles et anticipez les alertes."
        action={
          <button
            onClick={() => exportRows(fuels, 'stocks')}
            className="flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold"
          >
            <Download size={15} /> Exporter
          </button>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Mini label="Volume total disponible" value={`${nfmt(total)} L`} />
        <Mini label="Valeur estimée du stock" value={money(value)} />
        <Mini
          label="Types en alerte"
          value={`${fuels.filter((x) => Number(x.stock) < 100).length} sur ${fuels.length}`}
        />
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {fuels.map((x) => (
          <div className="rounded-2xl border border-line bg-white p-5 shadow-soft" key={x.id}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.couleur }} />
                {x.nom}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${x.stock < 50 ? 'bg-rose-50 text-rose-600' : x.stock < 100 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
              >
                {x.stock < 50 ? 'Critique' : x.stock < 100 ? 'Faible' : 'Normal'}
              </span>
            </div>
            <div className="title text-2xl font-extrabold">
              {nfmt(Number(x.stock))}
              <span className="ml-1 text-sm font-medium text-muted">L</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Number(x.stock) / 50)}%`, background: x.couleur }}
              />
            </div>
            <div className="mt-4 flex justify-between border-t border-line pt-3 text-[10px]">
              <span className="text-muted">Prix de vente · {money(x.prixVente)}/L</span>
              <span className="font-bold">{money(Number(x.stock) * Number(x.prixVente))}</span>
            </div>
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <div className="border-b border-line p-5">
          <h2 className="title text-[15px] font-bold">Historique des mouvements</h2>
          <p className="mt-1 text-[11px] text-muted">Achats et ventes récents</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-[9px] uppercase tracking-wider text-muted">Date</th>
                <th className="px-5 py-3 text-[9px] uppercase tracking-wider text-muted">
                  Opération
                </th>
                <th className="px-5 py-3 text-[9px] uppercase tracking-wider text-muted">
                  Carburant
                </th>
                <th className="px-5 py-3 text-[9px] uppercase tracking-wider text-muted">
                  Quantité
                </th>
                <th className="px-5 py-3 text-right text-[9px] uppercase tracking-wider text-muted">
                  Montant
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {moves.map((x) => (
                <tr key={x.id}>
                  <td className="px-5 py-3 text-[11px] text-muted">{dt(x.date)}</td>
                  <td className="px-5 py-3 text-[11px] font-semibold">{x.label}</td>
                  <td className="px-5 py-3 text-[11px]">{x.carburant?.nom}</td>
                  <td
                    className={`px-5 py-3 text-[11px] font-semibold ${x.entrant ? 'text-emerald-600' : 'text-rose-500'}`}
                  >
                    {x.entrant ? '+' : '−'}
                    {nfmt(x.quantite)} L
                  </td>
                  <td className="px-5 py-3 text-right text-[11px]">
                    {x.montant == null ? '—' : money(x.montant)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
