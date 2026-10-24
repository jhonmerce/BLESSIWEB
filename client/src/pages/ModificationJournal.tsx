import { useEffect, useState } from 'react';
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { Header, Mini } from '../components/common';
import { day, dt, money } from '../lib/format';
import type { AnyRow } from '../types';

type JournalPage = {
  data: AnyRow[];
  total: number;
  page: number;
  totalPages: number;
};

const entityLabels: Record<string, string> = {
  ACHAT: 'Achat',
  VENTE: 'Vente',
  DEPENSE: 'Dépense',
};

const fieldLabels: Record<string, string> = {
  carburant: 'Carburant',
  chauffeur: 'Chauffeur',
  categorie: 'Catégorie',
  date: 'Date de l’opération',
  fournisseur: 'Fournisseur',
  description: 'Description',
  clientNom: 'Nom du client',
  clientTelephone: 'Téléphone',
  clientPlaque: 'Plaque du véhicule',
  clientMarque: 'Marque du véhicule',
  quantite: 'Quantité',
  prixUnitaire: 'Prix unitaire',
  montant: 'Montant',
  devise: 'Devise',
  montantConverti: 'Montant converti',
  deviseConvertie: 'Devise de conversion',
  tauxUtilise: 'Taux appliqué',
  montantUSD: 'Montant en USD',
  coutUnitaireUSD: 'Coût unitaire en USD',
  coutTotalUSD: 'Coût total en USD',
  prixAchatReferenceUSD: 'Coût de référence en USD',
  beneficeUSD: 'Bénéfice en USD',
  debitUSD: 'Débit en USD',
  debitCDF: 'Débit en CDF',
  debitLitres: 'Litres débités du compte chauffeur',
  soldeChauffeurApres: 'Solde chauffeur après opération',
};

const visibleFields = Object.keys(fieldLabels);

function snapshotRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayAuditValue(field: string, value: unknown, snapshot: Record<string, unknown>) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'carburant' || field === 'chauffeur' || field === 'categorie') {
    if (typeof value !== 'object') return String(value);
    const related = value as Record<string, unknown>;
    const name = related.nom;
    const extra = field === 'chauffeur' ? related.plaque : undefined;
    return [name, extra].filter(Boolean).join(' · ') || '—';
  }
  if (field === 'date') return day(String(value));
  if (field === 'devise' || field === 'deviseConvertie') return String(value);
  if (field === 'tauxUtilise') {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 }).format(Number(value));
  }
  if (field === 'quantite' || field === 'debitLitres' || field === 'soldeChauffeurApres') {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(Number(value))} L`;
  }
  if (field === 'montant' || field === 'prixUnitaire') {
    return money(Number(value), String(snapshot.devise || 'USD'));
  }
  if (field === 'montantConverti') {
    return money(Number(value), String(snapshot.deviseConvertie || 'USD'));
  }
  if (
    field === 'montantUSD' ||
    field === 'coutUnitaireUSD' ||
    field === 'coutTotalUSD' ||
    field === 'prixAchatReferenceUSD' ||
    field === 'beneficeUSD' ||
    field === 'debitUSD'
  ) {
    return money(Number(value), 'USD');
  }
  if (field === 'debitCDF') return money(Number(value), 'CDF');
  return String(value);
}

function OperationComparison({ beforeValue, afterValue }: { beforeValue: unknown; afterValue: unknown }) {
  const before = snapshotRecord(beforeValue);
  const after = snapshotRecord(afterValue);
  const fields = visibleFields.filter(
    (field) =>
      (Object.prototype.hasOwnProperty.call(before, field) ||
        Object.prototype.hasOwnProperty.call(after, field)) &&
      displayAuditValue(field, before[field], before) !==
        displayAuditValue(field, after[field], after),
  );

  if (!fields.length) {
    return <p className="p-4 text-xs text-muted">Aucun détail métier disponible pour cette ancienne entrée.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[11px]">
        <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2.5">Information</th>
            <th className="px-3 py-2.5">Avant</th>
            <th className="px-3 py-2.5">Après</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {fields.map((field) => (
            <tr key={field}>
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-ink">
                {fieldLabels[field]}
              </th>
              <td className="px-3 py-2 text-slate-600">
                {displayAuditValue(field, before[field], before)}
              </td>
              <td className="px-3 py-2 font-medium text-ink">
                {displayAuditValue(field, after[field], after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ModificationJournal({
  req,
}: {
  req: (path: string, init?: RequestInit) => Promise<any>;
}) {
  const [data, setData] = useState<JournalPage>({ data: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: '15' });
    if (entity) params.set('entite', entity);
    if (action) params.set('action', action);
    if (from) params.set('de', from);
    if (to) params.set('a', to);
    setLoading(true);
    setError('');
    void req(`/journal-modifications?${params}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Journal indisponible.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [req, page, entity, action, from, to]);

  return (
    <>
      <Header
        eyebrow="Traçabilité et contrôle"
        title="Journal des modifications"
        subtitle="Consultez les opérations modifiées ou supprimées, leurs anciennes valeurs et les nouvelles."
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Mini label="Événements trouvés" value={String(data.total)} />
        <Mini label="Page" value={`${data.page} / ${Math.max(1, data.totalPages)}`} />
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <label className="grid gap-1 text-[10px] font-semibold text-muted">
            Opération
            <select className="rounded-lg border border-line px-3 py-2 text-xs text-ink" value={entity} onChange={(event) => { setEntity(event.target.value); setPage(1); }}>
              <option value="">Toutes</option>
              <option value="ACHAT">Achats</option>
              <option value="VENTE">Ventes</option>
              <option value="DEPENSE">Dépenses</option>
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-semibold text-muted">
            Action
            <select className="rounded-lg border border-line px-3 py-2 text-xs text-ink" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}>
              <option value="">Toutes</option>
              <option value="MODIFICATION">Modification</option>
              <option value="SUPPRESSION">Suppression</option>
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-semibold text-muted">
            Du
            <input type="date" className="rounded-lg border border-line px-3 py-2 text-xs text-ink" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
          </label>
          <label className="grid gap-1 text-[10px] font-semibold text-muted">
            Au
            <input type="date" className="rounded-lg border border-line px-3 py-2 text-xs text-ink" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
          </label>
        </div>
        {error && <p className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700" role="alert">{error}</p>}
        {loading ? (
          <p className="p-10 text-center text-xs text-muted" role="status">Chargement du journal…</p>
        ) : data.data.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="mx-auto mb-3 text-slate-300" size={26} />
            <p className="text-sm font-semibold text-ink">Aucune modification pour ces filtres.</p>
            <p className="mt-1 text-xs text-muted">Les modifications et suppressions futures seront enregistrées ici.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {data.data.map((entry) => (
              <details key={entry.id} className="group p-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${entry.action === 'SUPPRESSION' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>
                    {entry.action === 'SUPPRESSION' ? 'Suppression' : 'Modification'}
                  </span>
                  <span className="text-xs font-semibold text-ink">{entityLabels[entry.entite] || entry.entite}</span>
                  <span className="text-[11px] text-muted">Réf. {entry.entiteId}</span>
                  <span className="ml-auto text-[10px] text-muted">{dt(entry.creeLe)}</span>
                  <span className="w-full text-[10px] text-muted sm:w-auto">Par {entry.acteurEmail}</span>
                </summary>
                <div className="mt-4 overflow-hidden rounded-xl border border-line">
                  <OperationComparison beforeValue={entry.avant} afterValue={entry.apres} />
                </div>
              </details>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-[10px] text-muted">{data.total} événements · période {from ? day(from) : 'complète'}{to ? ` au ${day(to)}` : ''}</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Page précédente" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-line p-1.5 text-muted disabled:opacity-40"><ChevronLeft size={14} /></button>
            <span className="text-[11px]">{page} / {Math.max(1, data.totalPages)}</span>
            <button type="button" aria-label="Page suivante" disabled={page >= data.totalPages || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-line p-1.5 text-muted disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        </div>
      </section>
    </>
  );
}
