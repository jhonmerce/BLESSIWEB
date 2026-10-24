import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  Pencil,
  X,
} from 'lucide-react';
import type { AnyRow } from '../types';
import { Header, Mini, Field } from '../components/common';
import { day, dt, money, nfmt } from '../lib/format';
import { downloadExitVoucher } from '../lib/driverVouchers';
import { downloadSaleInvoice } from '../lib/saleInvoice';

export default function Operations({
  kind,
  rows,
  fuels,
  query,
  setQuery,
  page,
  setPage,
  open,
  edit,
  remove,
  exportRows,
  req,
  chauffeurs = [],
  historical = false,
}: {
  kind: string;
  rows: AnyRow[];
  fuels: AnyRow[];
  query: string;
  setQuery: (x: string) => void;
  page: number;
  setPage: (x: number) => void;
  open: () => void;
  edit: (row: AnyRow) => void;
  remove: (t: string, id: string) => Promise<void>;
  exportRows: (r: AnyRow[], n: string) => void;
  req: (path: string, init?: RequestInit) => Promise<any>;
  chauffeurs?: AnyRow[];
  historical?: boolean;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null);
  const [exitVoucherLoading, setExitVoucherLoading] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [pageRows, setPageRows] = useState<AnyRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const printInvoice = async (sale: AnyRow) => {
    setInvoiceError('');
    setInvoiceLoading(sale.id);
    try {
      await downloadSaleInvoice(sale);
    } catch {
      setInvoiceError('La facture PDF n’a pas pu être générée. Réessayez.');
    } finally {
      setInvoiceLoading(null);
    }
  };
  const printExitVoucher = async (sale: AnyRow) => {
    setInvoiceError('');
    setExitVoucherLoading(sale.id);
    try {
      await downloadExitVoucher(sale);
    } catch {
      setInvoiceError('Le bordereau de sortie n’a pas pu être généré. Réessayez.');
    } finally {
      setExitVoucherLoading(null);
    }
  };
  const deleteOperation = async (id: string) => {
    setDeletingIds((current) => [...current, id]);
    try {
      await remove(kind, id);
    } finally {
      setDeletingIds((current) => current.filter((item) => item !== id));
    }
  };
  const config: any = {
    achats: {
      title: 'Achats de carburant',
      eyebrow: 'Approvisionnement',
      sub: 'Gérez vos approvisionnements et suivez vos fournisseurs.',
      button: 'Nouvel achat',
      icon: ArrowDownLeft,
    },
    ventes: {
      title: 'Ventes de carburant',
      eyebrow: 'Encaissements',
      sub: 'Suivez les ventes et les revenus de votre station.',
      button: 'Nouvelle vente',
      icon: ArrowUpRight,
    },
    depenses: {
      title: 'Dépenses',
      eyebrow: 'Gestion financière',
      sub: 'Gardez le contrôle sur les charges de votre station.',
      button: 'Nouvelle dépense',
      icon: Receipt,
    },
  };
  const c = config[kind];
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: '8' });
      if (from) params.set('de', from);
      if (to) params.set('a', to);
      if (query.trim()) params.set('recherche', query.trim());

      setListLoading(true);
      setListError('');
      void req(`/${kind}?${params.toString()}`)
        .then((result) => {
          if (!active) return;
          setPageRows(result.data);
          setTotalRows(result.total);
          setTotalAmount(Number(result.totalAmountUSD || 0));
          const nextTotalPages = Math.max(1, result.totalPages);
          setTotalPages(nextTotalPages);
          if (page > nextTotalPages) setPage(nextTotalPages);
        })
        .catch((error: unknown) => {
          if (active) setListError(error instanceof Error ? error.message : 'Chargement impossible.');
        })
        .finally(() => {
          if (active) setListLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [req, kind, page, query, from, to, rows]);

  useEffect(() => {
    setPage(1);
  }, [kind, historical]);

  const filtered = pageRows;
  const cols =
    kind === 'achats'
      ? ['Date', 'Carburant', 'Fournisseur', 'Quantité', 'Prix / litre', 'Montant']
      : kind === 'ventes'
        ? ['Date & heure', 'Carburant', 'Quantité', 'Prix / litre', 'Montant']
        : ['Date', 'Catégorie', 'Description', 'Montant'];
  const currency = 'USD';
  const exportFiltered = async () => {
    if (exportLoading) return;
    const params = new URLSearchParams();
    if (from) params.set('de', from);
    if (to) params.set('a', to);
    if (query.trim()) params.set('recherche', query.trim());
    const queryString = params.toString();
    setExportLoading(true);
    setListError('');
    try {
      const result = await req(`/${kind}${queryString ? `?${queryString}` : ''}`);
      exportRows(result, kind);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Export impossible.');
    } finally {
      setExportLoading(false);
    }
  };
  return (
    <>
      <Header
        eyebrow={historical ? 'Archives et rapports' : c.eyebrow}
        title={historical ? `Historique des ${kind}` : c.title}
        subtitle={historical ? 'Consultez et filtrez vos opérations passées.' : c.sub}
        action={
          !historical && (
          <button
            onClick={open}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus size={15} />
            {c.button}
          </button>
          )
        }
      />
      {historical && (
        <nav
          aria-label="Type d’historique"
          className="mb-5 flex flex-wrap gap-2 rounded-xl border border-line bg-white p-2"
        >
          {[
            ['achats', 'Achats'],
            ['ventes', 'Ventes'],
            ['depenses', 'Dépenses'],
          ].map(([type, label]) => (
            <Link
              key={type}
              to={`/historiques/${type}`}
              aria-current={kind === type ? 'page' : undefined}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${kind === type ? 'bg-blue-600 text-white' : 'text-muted hover:bg-canvas hover:text-ink'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {invoiceError && (
        <p
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          role="alert"
        >
          {invoiceError}
        </p>
      )}
      {historical && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Mini label="Opérations filtrées" value={nfmt(totalRows)} />
          <Mini label="Montant cumulé" value={money(totalAmount, currency)} />
          <Mini
            label="Période"
            value={from || to ? `${from || '…'} — ${to || '…'}` : 'Toutes les dates'}
          />
        </div>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {!historical && (
          <>
            <Mini
              label={`${kind === 'depenses' ? 'Dépenses' : kind === 'achats' ? 'Achats' : 'Ventes'} filtrés`}
              value={nfmt(totalRows)}
            />
            <Mini
              label={
                kind === 'achats'
                  ? 'Total des achats'
                  : kind === 'ventes'
                    ? 'Chiffre d’affaires'
                    : 'Total des dépenses'
              }
              value={money(totalAmount, currency)}
            />
            <Mini
              label="Moyenne par opération"
              value={money(totalRows ? totalAmount / totalRows : 0, currency)}
            />
          </>
        )}
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="relative min-w-[190px] flex-1 sm:max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher une opération..."
              className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-line px-2 py-[7px] text-[11px] text-muted outline-none"
            />
            <span className="text-[10px] text-muted">au</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-line px-2 py-[7px] text-[11px] text-muted outline-none"
            />
            <button
              onClick={() => void exportFiltered()}
              disabled={exportLoading}
              aria-busy={exportLoading || undefined}
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-ink hover:bg-canvas disabled:cursor-wait disabled:opacity-60"
            >
              {exportLoading ? <LoaderCircle className="animate-spin" size={14} /> : <Download size={14} />}
              {exportLoading ? 'Préparation…' : 'Exporter'}
            </button>
          </div>
        </div>
        {listError && (
          <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700" role="alert">
            {listError}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="bg-slate-50/80">
                {cols.map((x) => (
                  <th
                    key={x}
                    className="px-4 py-3 text-[9px] font-bold uppercase tracking-[.12em] text-slate-500"
                  >
                    {x}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((x) => (
                <tr key={x.id} className="hover:bg-slate-50/70">
                  {kind === 'achats' ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-muted">
                        {day(x.date)}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] font-semibold text-ink">
                        <div>{x.carburant?.nom}</div>
                        {x.chauffeurId && (
                          <div className="mt-1 text-[9px] font-normal text-blue-700">
                            Compte :{' '}
                            {x.chauffeur?.nom ||
                              chauffeurs.find((driver) => driver.id === x.chauffeurId)?.nom ||
                              'Chauffeur'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-muted">{x.fournisseur || '—'}</td>
                      <td className="px-4 py-3.5 text-[11px] text-ink">{nfmt(x.quantite)} L</td>
                      <td className="px-4 py-3.5 text-[11px] text-muted">
                        {money(x.prixUnitaire)}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] font-bold text-ink">
                        <div>{money(Number(x.montant), x.devise || 'USD')}</div>
                        <div className="mt-1 text-[9px] font-normal text-muted">
                          {money(
                            Number(x.montantConverti ?? x.montant),
                            x.deviseConvertie || 'USD',
                          )}{' '}
                          | taux {Number(x.tauxUtilise ?? 1)}
                        </div>
                      </td>
                    </>
                  ) : kind === 'ventes' ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-muted">
                        {dt(x.date)}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] font-semibold text-ink">
                        <div>{x.carburant?.nom}</div>
                        {x.chauffeur && (
                          <div className="mt-1 text-[9px] font-normal text-blue-700">
                            {x.chauffeur.nom} · {x.chauffeur.plaque}
                          </div>
                        )}
                        {!x.chauffeur &&
                          (x.clientNom || x.clientTelephone || x.clientPlaque) && (
                            <div className="mt-1 space-y-0.5 text-[9px] font-normal text-muted">
                              <div>{x.clientNom || 'Client comptoir'}</div>
                              {(x.clientTelephone || x.clientPlaque) && (
                                <div>
                                  {[x.clientTelephone, x.clientPlaque].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-ink">{nfmt(x.quantite)} L</td>
                      <td className="px-4 py-3.5 text-[11px] text-muted">
                        {money(x.prixUnitaire)}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] font-bold text-emerald-700">
                        <div>{money(Number(x.montant), x.devise || 'USD')}</div>
                        <div className="mt-1 text-[9px] font-normal text-muted">
                          {money(
                            Number(x.montantConverti ?? x.montant),
                            x.deviseConvertie || 'USD',
                          )}{' '}
                          | taux {Number(x.tauxUtilise ?? 1)}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-muted">
                        {day(x.date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700">
                          {x.categorie?.nom}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-ink">{x.description}</td>
                      <td className="px-4 py-3.5 text-[11px] font-bold text-ink">
                        <div>{money(Number(x.montant), x.devise || 'USD')}</div>
                        <div className="mt-1 text-[9px] font-normal text-muted">
                          {money(
                            Number(x.montantConverti ?? x.montant),
                            x.deviseConvertie || 'USD',
                          )}{' '}
                          | taux {Number(x.tauxUtilise ?? 1)}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      title="Modifier cette opération"
                      aria-label={`Modifier l’opération ${x.id}`}
                      onClick={() => edit(x)}
                      className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                    >
                      <Pencil size={14} />
                    </button>
                    {kind === 'ventes' && !x.chauffeur && !x.chauffeurId && (
                      <button
                        type="button"
                        title="Télécharger la facture au format A5"
                        aria-label={`Télécharger la facture de la vente ${x.id}`}
                        disabled={invoiceLoading === x.id}
                        aria-busy={invoiceLoading === x.id || undefined}
                        onClick={() => void printInvoice(x)}
                        className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <Printer size={14} />
                      </button>
                    )}
                    {kind === 'ventes' && x.chauffeur && (
                      <button
                        type="button"
                        title="Télécharger le bordereau de sortie"
                        onClick={() => void printExitVoucher(x)}
                        disabled={exitVoucherLoading === x.id}
                        aria-busy={exitVoucherLoading === x.id || undefined}
                        className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
                      >
                        {exitVoucherLoading === x.id ? (
                          <LoaderCircle className="animate-spin" size={14} />
                        ) : (
                          <Printer size={14} />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => void deleteOperation(x.id)}
                      disabled={deletingIds.includes(x.id)}
                      aria-busy={deletingIds.includes(x.id) || undefined}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
                    >
                      {deletingIds.includes(x.id) ? (
                        <LoaderCircle className="animate-spin" size={14} />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!listLoading && filtered.length === 0 && (
            <div className="p-12 text-center text-xs text-muted">
              Aucune opération ne correspond à votre recherche.
            </div>
          )}
          {listLoading && (
            <div className="p-8 text-center text-xs text-muted" role="status" aria-live="polite">
              Chargement des opérations…
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-[10px] text-muted">
            Affichage de{' '}
            <b>
              {totalRows ? (page - 1) * 8 + 1 : 0}–{Math.min(page * 8, totalRows)}
            </b>{' '}
            sur <b>{totalRows}</b> opérations
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || listLoading}
              aria-label="Page précédente"
              className="rounded-lg border border-line p-1.5 text-muted"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-[11px]">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || listLoading}
              aria-label="Page suivante"
              className="rounded-lg border border-line p-1.5 text-muted"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export function OperationModal({
  kind,
  form,
  editing = false,
  setForm,
  fuels,
  cats,
  rows,
  saving,
  status,
  defaultCurrency,
  rates,
  chauffeurs,
  companies,
  close,
  save,
}: {
  kind: string;
  form: AnyRow;
  editing?: boolean;
  setForm: (x: AnyRow) => void;
  fuels: AnyRow[];
  cats: string[];
  rows: Record<string, AnyRow[]>;
  saving: boolean;
  status: string;
  defaultCurrency: string;
  rates: AnyRow[];
  chauffeurs: AnyRow[];
  companies: AnyRow[];
  close: () => void;
  save: () => void;
}) {
  const isPurchase = kind === 'achats',
    isSale = kind === 'ventes',
    fuel = fuels.find((x) => x.id === form.carburantId);
  const sourceCurrency = form.devise || defaultCurrency || 'USD';
  const [manualSalePrice, setManualSalePrice] = useState(false);
  const dailyRate = Number(
    rates.find(
      (rate) =>
        rate.date.slice(0, 10) === form.date &&
        rate.deviseSource === 'USD' &&
        rate.deviseCible === 'CDF',
    )?.taux || 0,
  );
  const conversionRate = sourceCurrency === 'USD' ? dailyRate : dailyRate ? 1 / dailyRate : 0;
  const targetCurrency = sourceCurrency === 'USD' ? 'CDF' : 'USD';
  const defaultSalePrice =
    Number(fuel?.prixVente || 0) * (sourceCurrency === 'CDF' ? dailyRate : 1);
  const companyDrivers = chauffeurs.filter((driver) => driver.entrepriseId === form.entrepriseId);
  const selectedDriver = companyDrivers.find((driver) => driver.id === form.chauffeurId);
  const prepaidPriceUSD = Number(
    selectedDriver?.soldes?.find((balance: AnyRow) => balance.carburantId === fuel?.id)
      ?.prixMoyenPrepayUSD || 0,
  );
  const unitPrice =
    isSale && form.chauffeurId && prepaidPriceUSD > 0
      ? sourceCurrency === 'USD'
        ? prepaidPriceUSD
        : conversionRate
          ? prepaidPriceUSD / conversionRate
          : 0
      : Number(form.prixUnitaire || (isSale ? defaultSalePrice : 0));
  const amount =
    isSale || isPurchase ? Number(form.quantite || 0) * unitPrice : Number(form.montant || 0);
  const converted = conversionRate ? Math.round(amount * conversionRate * 100) / 100 : null;
  const available =
    Number(fuel?.stock || 0) +
    (editing &&
    isSale &&
    !form._originalChauffeurId &&
    form._originalCarburantId === form.carburantId
      ? Number(form._originalQuantite || 0)
      : 0);
  const requiresStationStock = isSale && !form.chauffeurId;
  const clientTelephone = String(form.clientTelephone || '').trim();
  const clientTelephoneValid = !clientTelephone || /^[+0-9().\-\s]+$/.test(clientTelephone);
  const driverBalance = Number(
    selectedDriver?.soldes?.find((balance: AnyRow) => balance.carburantId === fuel?.id)?.quantite ||
      0,
  ) +
    (editing &&
    isSale &&
    form._originalChauffeurId === selectedDriver?.id &&
    form._originalCarburantId === fuel?.id
      ? Number(form._originalQuantite || 0)
      : 0);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onClick={saving ? undefined : close}
      aria-busy={saving}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="title text-xl font-bold text-ink">
              {editing
                ? isPurchase
                  ? 'Modifier l’achat'
                  : isSale
                    ? 'Modifier la vente'
                    : 'Modifier la dépense'
                : isPurchase
                  ? 'Nouvel achat'
                  : isSale
                    ? 'Nouvelle vente'
                    : 'Nouvelle dépense'}
            </h2>
            <p className="mt-1 text-xs text-muted">Renseignez les informations de l’opération.</p>
          </div>
          <button
            onClick={close}
            disabled={saving}
            aria-label="Fermer la fenêtre"
            className="rounded-lg p-2 text-muted hover:bg-canvas disabled:cursor-wait disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Devise de l’opération">
            <select
              value={sourceCurrency}
              onChange={(event) => {
                const nextCurrency = event.target.value;
                const nextPrice = isSale
                  ? nextCurrency === 'USD'
                    ? Number(fuel?.prixVente || 0)
                    : Number(fuel?.prixVente || 0) * dailyRate
                  : form.prixUnitaire;
                setManualSalePrice(false);
                setForm({ ...form, devise: nextCurrency, prixUnitaire: nextPrice || '' });
              }}
            >
              <option value="USD">USD</option>
              <option value="CDF">CDF</option>
            </select>
          </Field>
          {!isSale && !isPurchase && (
            <Field label="Catégorie">
              <select
                value={form.categorieId || ''}
                onChange={(e) => setForm({ ...form, categorieId: e.target.value })}
              >
                <option value="">Sélectionner</option>
                {cats.map((x, i) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {(isSale || isPurchase) && (
            <Field label="Type de carburant">
              <select
                value={form.carburantId || ''}
                onChange={(e) => {
                  const f = fuels.find((x) => x.id === e.target.value);
                  setManualSalePrice(false);
                  setForm({
                    ...form,
                    carburantId: e.target.value,
                    prixUnitaire: isSale
                      ? sourceCurrency === 'USD'
                        ? f?.prixVente
                        : Number(f?.prixVente || 0) * dailyRate || ''
                      : form.prixUnitaire,
                  });
                }}
              >
                {fuels.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.nom}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {isSale && (
            <div className="flex items-end">
              <div
                className={`w-full rounded-xl border px-3 py-2 ${available < 50 ? 'border-rose-200 bg-rose-50' : 'border-emerald-100 bg-emerald-50'}`}
              >
                <div className="text-[9px] font-semibold uppercase text-muted">
                  Stock station disponible
                </div>
                <div
                  className={`mt-1 text-sm font-bold ${available < 50 ? 'text-rose-600' : 'text-emerald-700'}`}
                >
                  {nfmt(available)} L
                </div>
              </div>
            </div>
          )}
          {isSale && (
            <Field label="Entreprise (facultatif)">
              <select
                value={form.entrepriseId || ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    entrepriseId: event.target.value,
                    chauffeurId: '',
                    clientNom: '',
                    clientTelephone: '',
                    clientPlaque: '',
                    clientMarque: '',
                  })
                }
              >
                <option value="">Vente classique, sans compte chauffeur</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nom}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {isSale && form.entrepriseId && (
            <Field label="Chauffeur de l’entreprise">
              <select
                value={form.chauffeurId || ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    chauffeurId: event.target.value,
                    clientNom: '',
                    clientTelephone: '',
                    clientPlaque: '',
                    clientMarque: '',
                  })
                }
              >
                <option value="">Sélectionner un chauffeur</option>
                {companyDrivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.nom} · {driver.plaque} ·{' '}
                    {Number(
                      driver.soldes?.find((balance: AnyRow) => balance.carburantId === fuel?.id)
                        ?.quantite || 0,
                    ).toFixed(3)}{' '}
                    L de {fuel?.nom || 'carburant'}
                  </option>
                ))}
              </select>
              {!companyDrivers.length && (
                <p className="mt-2 text-[10px] text-rose-600">
                  Cette entreprise n’a aucun chauffeur actif.
                </p>
              )}
              {form.chauffeurId && selectedDriver && (
                <div
                  className={`mt-2 rounded-lg p-2 text-[10px] ${driverBalance >= Number(form.quantite || 0) ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}
                >
                  Solde {fuel?.nom} : {driverBalance.toFixed(3)} L ·{' '}
                  {Number(form.quantite || 0) > driverBalance
                    ? `il manque ${(Number(form.quantite || 0) - driverBalance).toFixed(3)} L.`
                    : 'solde suffisant pour cette vente.'}
                </div>
              )}
            </Field>
          )}{' '}
          {isSale && !form.entrepriseId && (
            <section className="col-span-full rounded-xl border border-line bg-slate-50/70 p-4">
              <div className="mb-3">
                <h3 className="text-xs font-bold text-ink">Informations du client</h3>
                <p className="mt-1 text-[10px] text-muted">
                  Facultatives pour une vente au comptoir. Elles figureront sur la facture.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nom du client (facultatif)">
                  <input
                    autoComplete="name"
                    maxLength={120}
                    value={form.clientNom || ''}
                    onChange={(event) => setForm({ ...form, clientNom: event.target.value })}
                    placeholder="Nom complet"
                  />
                </Field>
                <Field label="Téléphone (facultatif)">
                  <input
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    value={form.clientTelephone || ''}
                    onChange={(event) => setForm({ ...form, clientTelephone: event.target.value })}
                    placeholder="Ex. +243 000 000 000"
                    aria-invalid={!clientTelephoneValid}
                  />
                  {!clientTelephoneValid && (
                    <span className="mt-1 block text-[10px] font-normal text-rose-600" role="alert">
                      Saisissez un numéro avec des chiffres, espaces ou les signes + ( ) -.
                    </span>
                  )}
                </Field>
                <Field label="Plaque du véhicule (facultatif)">
                  <input
                    maxLength={20}
                    value={form.clientPlaque || ''}
                    onChange={(event) => setForm({ ...form, clientPlaque: event.target.value })}
                    placeholder="Ex. 1234AB01"
                  />
                </Field>
                <Field label="Marque du véhicule (facultatif)">
                  <input
                    maxLength={60}
                    value={form.clientMarque || ''}
                    onChange={(event) => setForm({ ...form, clientMarque: event.target.value })}
                    placeholder="Ex. Toyota"
                  />
                </Field>
              </div>
            </section>
          )}
          {(isSale || isPurchase) && (
            <Field label="Quantité (litres)">
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={form.quantite || ''}
                onChange={(e) => setForm({ ...form, quantite: e.target.value })}
                placeholder="Ex. 250"
              />
            </Field>
          )}
          {(isSale || isPurchase) && (
            <Field
              label={`${form.chauffeurId && prepaidPriceUSD > 0 ? 'Prix prépayé' : 'Prix au litre'} (${sourceCurrency})`}
            >
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={
                  form.chauffeurId && prepaidPriceUSD > 0
                    ? unitPrice
                    : (form.prixUnitaire ?? (isSale ? defaultSalePrice || '' : ''))
                }
                readOnly={Boolean(form.chauffeurId && prepaidPriceUSD > 0)}
                onChange={(e) => {
                  setManualSalePrice(true);
                  setForm({ ...form, prixUnitaire: e.target.value });
                }}
                placeholder="0,00"
              />
            </Field>
          )}
          {isPurchase && (
            <Field label="Fournisseur">
              <input
                value={form.fournisseur || ''}
                onChange={(e) => setForm({ ...form, fournisseur: e.target.value })}
                placeholder="Nom du fournisseur"
              />
            </Field>
          )}
          {!isSale && !isPurchase && (
            <Field label={`Montant (${sourceCurrency})`}>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.montant || ''}
                onChange={(e) => setForm({ ...form, montant: e.target.value })}
                placeholder="0,00"
              />
            </Field>
          )}
          {!isSale && !isPurchase && (
            <Field label="Description">
              <input
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Détail de la dépense"
              />
            </Field>
          )}
          <Field label="Date">
            <input
              type="date"
              value={form.date || ''}
              onChange={(e) => {
                const nextDate = e.target.value;
                const dateRate = Number(
                  rates.find(
                    (rate) =>
                      rate.date.slice(0, 10) === nextDate &&
                      rate.deviseSource === 'USD' &&
                      rate.deviseCible === 'CDF',
                  )?.taux || 0,
                );
                const nextPrice =
                  isSale && !manualSalePrice
                    ? sourceCurrency === 'USD'
                      ? Number(fuel?.prixVente || 0)
                      : Number(fuel?.prixVente || 0) * dateRate
                    : form.prixUnitaire;
                setForm({ ...form, date: nextDate, prixUnitaire: nextPrice || '' });
              }}
            />
          </Field>
        </div>
        {(isSale || isPurchase) && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-xs text-muted">
              {isSale
                ? form.chauffeurId
                  ? 'Montant prépayé consommé'
                  : 'Montant encaissé'
                : 'Montant total'}
            </span>
            <span className="title text-lg font-bold text-ink">
              {money(amount, sourceCurrency)}
            </span>
          </div>
        )}
        {requiresStationStock && Number(form.quantite) > available && (
          <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            La quantité demandée dépasse le stock disponible.
          </div>
        )}
        <div className="mt-4 rounded-xl border border-line bg-slate-50 px-4 py-3 text-xs">
          {converted === null ? (
            <span className="text-rose-600">
              {`Configurez le taux USD/CDF du ${form.date || 'jour choisi'} dans Param\u00e8tres.`}
            </span>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {money(amount, sourceCurrency)} → {money(converted, targetCurrency)}
              </span>
              Taux: 1 {sourceCurrency} = {conversionRate} {targetCurrency}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={close}
            disabled={saving}
            className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-muted disabled:cursor-wait disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            disabled={
              saving ||
              !clientTelephoneValid ||
              (isSale && form.entrepriseId && !form.chauffeurId) ||
              ((isSale || isPurchase) &&
                (!Number(form.quantite) ||
                  Number(form.quantite) <= 0 ||
                  Number(form.prixUnitaire || fuel?.prixVente) <= 0 ||
                  (requiresStationStock && Number(form.quantite) > available))) ||
              !form.date ||
              converted === null ||
              (!isPurchase && !isSale && (!Number(form.montant) || !form.categorieId))
            }
            aria-busy={saving}
            onClick={save}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editing ? 'Enregistrer les modifications' : 'Enregistrer l’opération'}
          </button>
        </div>
        {saving && (
          <div
            className="mt-3 flex items-center justify-end gap-2 text-xs text-blue-700"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />
            <span>{status || 'Traitement en cours…'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
