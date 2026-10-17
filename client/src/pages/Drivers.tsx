import { useRef, useState } from 'react';
import { Fuel, LoaderCircle, Plus, RefreshCw, Truck } from 'lucide-react';
import type { AnyRow } from '../types';
import { Header, Metric, Field } from '../components/common';
import { money, nfmt } from '../lib/format';
import { downloadProvisionVoucher } from '../lib/driverVouchers';

type LedgerPage = {
  data: AnyRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type DriversProps = {
  drivers: AnyRow[];
  companies: AnyRow[];
  fuels: AnyRow[];
  defaultCurrency: string;
  rates: AnyRow[];
  req: (path: string, init?: RequestInit) => Promise<any>;
  refresh: () => Promise<void>;
  toast: (message: string) => void;
};

export default function Drivers({
  drivers,
  companies,
  fuels,
  defaultCurrency,
  rates,
  req,
  refresh,
  toast,
}: DriversProps) {
  const [showDriver, setShowDriver] = useState(false);
  const [showFunding, setShowFunding] = useState<AnyRow | null>(null);
  const [showCompany, setShowCompany] = useState(companies.length === 0);
  const [driver, setDriver] = useState<AnyRow>({});
  const [funding, setFunding] = useState<AnyRow>({
    carburantId: fuels[0]?.id || '',
    devise: defaultCurrency,
  });
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const fundingIdempotency = useRef<{ payload: string; key: string } | null>(null);
  const [ledger, setLedger] = useState<Record<string, LedgerPage>>({});
  const [activeLedger, setActiveLedger] = useState<string | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState<Record<string, boolean>>({});
  const [ledgerFilters, setLedgerFilters] = useState({ carburantId: '', debut: '', fin: '' });
  const fundingRateConfigured = rates.some(
    (rate) =>
      rate.date.slice(0, 10) === funding.date &&
      rate.deviseSource === 'USD' &&
      rate.deviseCible === 'CDF',
  );
  const loadLedger = async (driverId: string, page = 1) => {
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (ledgerFilters.carburantId) params.set('carburantId', ledgerFilters.carburantId);
    if (ledgerFilters.debut) params.set('debut', ledgerFilters.debut);
    if (ledgerFilters.fin) params.set('fin', ledgerFilters.fin);
    setLedgerLoading((current) => ({ ...current, [driverId]: true }));
    try {
      const result = await req(`/chauffeurs/${driverId}/mouvements?${params.toString()}`);
      setLedger((current) => ({ ...current, [driverId]: result }));
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setLedgerLoading((current) => ({ ...current, [driverId]: false }));
    }
  };

  const toggleLedger = async (driverId: string) => {
    if (activeLedger === driverId) {
      setActiveLedger(null);
      return;
    }
    setActiveLedger(driverId);
    await loadLedger(driverId);
  };

  const createCompany = async () => {
    if (!companyName.trim()) return;
    setBusyLabel('Création de l’entreprise…');
    setBusy(true);
    try {
      await req('/entreprises', {
        method: 'POST',
        body: JSON.stringify({ nom: companyName.trim() }),
      });
      setCompanyName('');
      setShowCompany(false);
      await refresh();
      toast('Entreprise ajoutée.');
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const createDriver = async () => {
    setBusyLabel('Création du compte chauffeur…');
    setBusy(true);
    try {
      await req('/chauffeurs', { method: 'POST', body: JSON.stringify(driver) });
      setShowDriver(false);
      setDriver({});
      await refresh();
      toast('Compte chauffeur créé.');
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const deposit = async () => {
    if (!showFunding) return;
    setBusyLabel('Approvisionnement du compte chauffeur…');
    setBusy(true);
    try {
      const payload = {
        carburantId: funding.carburantId,
        quantite: Number(funding.quantite),
        prixUnitaire: Number(funding.prixUnitaire),
        devise: funding.devise || defaultCurrency,
        date: new Date(`${funding.date}T12:00:00`).toISOString(),
        description: funding.description,
      };
      const fingerprint = JSON.stringify(payload);
      if (fundingIdempotency.current?.payload !== fingerprint) {
        fundingIdempotency.current = { payload: fingerprint, key: crypto.randomUUID() };
      }
      const result = await req(`/chauffeurs/${showFunding.id}/approvisionnements`, {
        method: 'POST',
        headers: { 'Idempotency-Key': fundingIdempotency.current.key },
        body: JSON.stringify(payload),
      });
      await downloadProvisionVoucher(result);
      await loadLedger(showFunding.id);
      setShowFunding(null);
      fundingIdempotency.current = null;
      setFunding({ carburantId: fuels[0]?.id || '', devise: defaultCurrency });
      await refresh();
      toast('Compte approvisionné.');
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  return (
    <>
      <Header
        eyebrow="Comptes clients"
        title="Entreprises et chauffeurs"
        subtitle="Approvisionnez les comptes en litres et suivez le solde de chaque carburant par chauffeur."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setShowCompany(true)}
              className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold text-ink"
            >
              Entreprise
            </button>
            <button
              onClick={() => {
                setDriver({ entrepriseId: companies[0]?.id || '' });
                setShowDriver(true);
              }}
              disabled={!companies.length}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Plus size={15} /> Nouveau chauffeur
            </button>
          </div>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Chauffeurs actifs"
          value={String(drivers.length)}
          change="Comptes ouverts"
          icon={Truck}
          foot="Entreprises abonnées"
        />
        {fuels.map((fuel) => (
          <Metric
            key={fuel.id}
            label={`Solde ${fuel.nom}`}
            value={`${nfmt(
              drivers.reduce(
                (total, item) =>
                  total +
                  Number(
                    item.soldes?.find((balance: AnyRow) => balance.carburantId === fuel.id)
                      ?.quantite || 0,
                  ),
                0,
              ),
            )} L`}
            change="Tous les comptes"
            icon={Fuel}
            tone="green"
            foot="Comptes chauffeurs"
          />
        ))}
      </div>
      <div className="space-y-4">
        {companies.map((company) => (
          <section
            key={company.id}
            className="overflow-hidden rounded-2xl border border-line bg-white"
          >
            <div className="border-b border-line bg-slate-50 px-5 py-4">
              <h2 className="font-bold text-ink">{company.nom}</h2>
              <p className="mt-1 text-xs text-muted">
                {company.telephone || 'Aucun téléphone'} ·{' '}
                {drivers.filter((item) => item.entrepriseId === company.id).length} chauffeur(s)
              </p>
            </div>
            <div className="divide-y divide-line">
              {drivers
                .filter((item) => item.entrepriseId === company.id)
                .map((item) => (
                  <article
                    key={item.id}
                    className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div>
                      <h3 className="font-semibold text-ink">{item.nom}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {item.telephone} · {item.marque} · {item.plaque}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {fuels.map((fuel) => (
                          <span
                            key={fuel.id}
                            className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"
                          >
                            {fuel.nom} :{' '}
                            {nfmt(
                              Number(
                                item.soldes?.find(
                                  (balance: AnyRow) => balance.carburantId === fuel.id,
                                )?.quantite || 0,
                              ),
                            )}{' '}
                            L
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleLedger(item.id)}
                        aria-expanded={activeLedger === item.id}
                        className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {activeLedger === item.id
                          ? 'Masquer l’historique'
                          : 'Afficher l’historique'}
                      </button>
                      {activeLedger === item.id && ledgerLoading[item.id] && (
                        <div
                          className="mt-3 flex items-center gap-2 text-xs text-muted"
                          role="status"
                        >
                          <LoaderCircle size={14} className="animate-spin" /> Chargement de
                          l’historique…
                        </div>
                      )}
                      {activeLedger === item.id && !ledgerLoading[item.id] && (
                        <div className="mt-4 space-y-3 rounded-xl border border-line bg-slate-50 p-3">
                          <form
                            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void loadLedger(item.id);
                            }}
                          >
                            <label className="text-[11px] font-medium text-muted">
                              Carburant
                              <select
                                value={ledgerFilters.carburantId}
                                onChange={(event) =>
                                  setLedgerFilters({
                                    ...ledgerFilters,
                                    carburantId: event.target.value,
                                  })
                                }
                                className="mt-1 block w-full rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink"
                              >
                                <option value="">Tous les carburants</option>
                                {fuels.map((fuel) => (
                                  <option key={fuel.id} value={fuel.id}>
                                    {fuel.nom}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-[11px] font-medium text-muted">
                              Du
                              <input
                                type="date"
                                value={ledgerFilters.debut}
                                onChange={(event) =>
                                  setLedgerFilters({ ...ledgerFilters, debut: event.target.value })
                                }
                                className="mt-1 block w-full rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink"
                              />
                            </label>
                            <label className="text-[11px] font-medium text-muted">
                              Au
                              <input
                                type="date"
                                value={ledgerFilters.fin}
                                onChange={(event) =>
                                  setLedgerFilters({ ...ledgerFilters, fin: event.target.value })
                                }
                                className="mt-1 block w-full rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink"
                              />
                            </label>
                            <button
                              type="submit"
                              className="self-end rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                            >
                              Filtrer
                            </button>
                          </form>
                          <div className="overflow-x-auto rounded-lg border border-line bg-white">
                            <table className="w-full min-w-[700px] text-left text-xs">
                              <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-muted">
                                <tr>
                                  <th className="px-3 py-2">Date et heure</th>
                                  <th className="px-3 py-2">Mouvement</th>
                                  <th className="px-3 py-2 text-right">Variation</th>
                                  <th className="px-3 py-2 text-right">Solde après</th>
                                  <th className="px-3 py-2">Détail</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {(ledger[item.id]?.data || []).map((move) => {
                                  const variation = Number(move.variationLitres || 0);
                                  const date = new Date(move.date || move.creeLe);
                                  return (
                                    <tr key={move.id}>
                                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                                        {date.toLocaleString('fr-FR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="px-3 py-2 font-medium text-ink">
                                        {move.type === 'APPROVISIONNEMENT'
                                          ? 'Approvisionnement'
                                          : move.type === 'ANNULATION'
                                            ? 'Annulation'
                                            : 'Prise de carburant'}
                                        <span className="ml-1 text-muted">
                                          · {move.carburant?.nom || 'Carburant'}
                                        </span>
                                      </td>
                                      <td
                                        className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${variation >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                                      >
                                        {variation > 0 ? '+' : ''}
                                        {nfmt(variation)} L
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-ink">
                                        {nfmt(Number(move.soldeLitres || 0))} L
                                      </td>
                                      <td className="px-3 py-2 text-muted">
                                        {move.type === 'APPROVISIONNEMENT' ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void downloadProvisionVoucher({
                                                mouvement: move,
                                                chauffeur: item,
                                                carburant: move.carburant,
                                                soldeAvantLitres:
                                                  Number(move.soldeLitres || 0) - variation,
                                                soldeLitres: move.soldeLitres,
                                              }).catch((error) => toast((error as Error).message))
                                            }
                                            className="font-semibold text-blue-600 hover:text-blue-800"
                                          >
                                            Bordereau PDF
                                          </button>
                                        ) : (
                                          move.description || '—'
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {!ledger[item.id]?.data?.length && (
                                  <tr>
                                    <td colSpan={5} className="px-3 py-6 text-center text-muted">
                                      Aucun mouvement pour ces filtres.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
                            <span>
                              {ledger[item.id]?.total || 0} mouvement(s) · du plus ancien au plus
                              récent
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={(ledger[item.id]?.page || 1) <= 1}
                                onClick={() => void loadLedger(item.id, ledger[item.id].page - 1)}
                                className="rounded-md border border-line bg-white px-2 py-1 disabled:opacity-40"
                              >
                                Précédent
                              </button>
                              <span>
                                Page {ledger[item.id]?.page || 1} /{' '}
                                {Math.max(ledger[item.id]?.totalPages || 0, 1)}
                              </span>
                              <button
                                type="button"
                                disabled={
                                  (ledger[item.id]?.page || 1) >= (ledger[item.id]?.totalPages || 0)
                                }
                                onClick={() => void loadLedger(item.id, ledger[item.id].page + 1)}
                                className="rounded-md border border-line bg-white px-2 py-1 disabled:opacity-40"
                              >
                                Suivant
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        fundingIdempotency.current = null;
                        setShowFunding(item);
                        const date = new Date();
                        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                        const operationDate = date.toISOString().slice(0, 10);
                        const rate = Number(
                          rates.find(
                            (row) =>
                              row.date.slice(0, 10) === operationDate &&
                              row.deviseSource === 'USD' &&
                              row.deviseCible === 'CDF',
                          )?.taux || 0,
                        );
                        const fuel = fuels[0];
                        setFunding({
                          carburantId: fuel?.id || '',
                          devise: defaultCurrency,
                          date: operationDate,
                          prixUnitaire:
                            Number(fuel?.prixVente || 0) * (defaultCurrency === 'CDF' ? rate : 1),
                        });
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-white"
                    >
                      <Plus size={14} /> Approvisionner
                    </button>
                  </article>
                ))}
              {drivers.every((item) => item.entrepriseId !== company.id) && (
                <div className="p-8 text-center text-xs text-muted">
                  Aucun chauffeur dans cette entreprise.
                </div>
              )}
            </div>
          </section>
        ))}
        {!companies.length && (
          <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
            <RefreshCw className="mx-auto mb-3" />
            Ajoutez d’abord une entreprise, puis créez ses comptes chauffeurs.
          </div>
        )}
      </div>

      {(showCompany || showDriver || showFunding) && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4"
          onClick={() => {
            if (busy) return;
            setShowCompany(false);
            setShowDriver(false);
            setShowFunding(null);
            fundingIdempotency.current = null;
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="title mb-5 text-lg font-bold text-ink">
              {showFunding
                ? `Approvisionner ${showFunding.nom}`
                : showDriver
                  ? 'Nouveau compte chauffeur'
                  : 'Nouvelle entreprise'}
            </h2>
            {busy && (
              <div
                className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700"
                role="status"
                aria-live="polite"
              >
                <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />
                {busyLabel || 'Traitement en cours…'}
              </div>
            )}
            {showCompany && (
              <div className="grid gap-4">
                <Field label="Nom de l’entreprise">
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <button
                  disabled={busy}
                  onClick={createCompany}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Créer l’entreprise
                </button>
              </div>
            )}
            {showDriver && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Entreprise">
                  <select
                    value={driver.entrepriseId || ''}
                    onChange={(e) => setDriver({ ...driver, entrepriseId: e.target.value })}
                  >
                    {companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nom}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nom du chauffeur">
                  <input
                    value={driver.nom || ''}
                    onChange={(e) => setDriver({ ...driver, nom: e.target.value })}
                  />
                </Field>
                <Field label="Téléphone">
                  <input
                    value={driver.telephone || ''}
                    onChange={(e) => setDriver({ ...driver, telephone: e.target.value })}
                  />
                </Field>
                <Field label="Plaque">
                  <input
                    value={driver.plaque || ''}
                    onChange={(e) => setDriver({ ...driver, plaque: e.target.value.toUpperCase() })}
                  />
                </Field>
                <Field label="Marque du véhicule">
                  <input
                    value={driver.marque || ''}
                    onChange={(e) => setDriver({ ...driver, marque: e.target.value })}
                  />
                </Field>
                <button
                  disabled={
                    busy ||
                    !driver.entrepriseId ||
                    !driver.nom ||
                    !driver.telephone ||
                    !driver.plaque ||
                    !driver.marque
                  }
                  onClick={createDriver}
                  className="self-end rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Créer le compte
                </button>
              </div>
            )}
            {showFunding && (
              <div className="grid gap-4">
                <Field label="Devise du paiement">
                  <select
                    value={funding.devise || defaultCurrency}
                    onChange={(event) => {
                      const devise = event.target.value;
                      const rate = Number(
                        rates.find(
                          (row) =>
                            row.date.slice(0, 10) === funding.date &&
                            row.deviseSource === 'USD' &&
                            row.deviseCible === 'CDF',
                        )?.taux || 0,
                      );
                      const fuel = fuels.find((row) => row.id === funding.carburantId);
                      setFunding({
                        ...funding,
                        devise,
                        prixUnitaire: Number(fuel?.prixVente || 0) * (devise === 'CDF' ? rate : 1),
                      });
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="CDF">CDF</option>
                  </select>
                </Field>
                <Field label="Type de carburant">
                  <select
                    value={funding.carburantId || ''}
                    onChange={(event) => {
                      const rate = Number(
                        rates.find(
                          (row) =>
                            row.date.slice(0, 10) === funding.date &&
                            row.deviseSource === 'USD' &&
                            row.deviseCible === 'CDF',
                        )?.taux || 0,
                      );
                      const fuel = fuels.find((row) => row.id === event.target.value);
                      setFunding({
                        ...funding,
                        carburantId: event.target.value,
                        prixUnitaire:
                          Number(fuel?.prixVente || 0) * (funding.devise === 'CDF' ? rate : 1),
                      });
                    }}
                  >
                    <option value="">Sélectionner un carburant</option>
                    {fuels.map((fuel) => (
                      <option key={fuel.id} value={fuel.id}>
                        {fuel.nom}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Prix payé au litre (${funding.devise || defaultCurrency})`}>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={funding.prixUnitaire || ''}
                    onChange={(event) =>
                      setFunding({ ...funding, prixUnitaire: event.target.value })
                    }
                  />
                </Field>
                <Field label="Quantité à approvisionner (litres)">
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={funding.quantite || ''}
                    onChange={(e) => setFunding({ ...funding, quantite: e.target.value })}
                  />
                </Field>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-muted">Avance payée par l’entreprise </span>
                  <strong>
                    {money(
                      Number(funding.quantite || 0) * Number(funding.prixUnitaire || 0),
                      funding.devise || defaultCurrency,
                    )}
                  </strong>
                </div>
                {!fundingRateConfigured && (
                  <p className="text-xs text-rose-600">
                    Configurez le taux USD/CDF du jour dans Paramètres avant d’enregistrer le
                    paiement.
                  </p>
                )}
                <Field label="Référence / note (facultatif)">
                  <input
                    value={funding.description || ''}
                    onChange={(e) => setFunding({ ...funding, description: e.target.value })}
                  />
                </Field>
                <button
                  disabled={
                    busy ||
                    !funding.carburantId ||
                    Number(funding.quantite) <= 0 ||
                    Number(funding.prixUnitaire) <= 0 ||
                    !fundingRateConfigured
                  }
                  onClick={deposit}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Confirmer l’approvisionnement
                </button>
              </div>
            )}
            <button
              onClick={() => {
                setShowCompany(false);
                setShowDriver(false);
                setShowFunding(null);
                fundingIdempotency.current = null;
              }}
              disabled={busy}
              className="mt-4 w-full rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-muted disabled:cursor-wait disabled:opacity-40"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
