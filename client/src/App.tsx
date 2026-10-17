import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Fuel,
  History as HistoryIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  X,
  CircleHelp,
  ChevronDown,
  Truck,
} from 'lucide-react';
import type { AnyRow } from './types';
import Operations, { OperationModal } from './pages/Operations';
import { exportRows } from './lib/export';
import { downloadExitVoucher } from './lib/driverVouchers';
import { LoadingState } from './components/common';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Stocks = lazy(() => import('./pages/Stocks'));
const Reports = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Login = lazy(() => import('./pages/Login'));
const Drivers = lazy(() => import('./pages/Drivers'));

type SessionUser = {
  email: string;
  role: 'ADMIN' | 'GERANT';
  impersonatedByEmail?: string;
};

const nav = [
  ['/tableau-de-bord', 'Tableau de bord', LayoutDashboard],
  ['/achats', 'Achats', ArrowDownLeft],
  ['/ventes', 'Ventes', ArrowUpRight],
  ['/chauffeurs', 'Chauffeurs', Truck],
  ['/depenses', 'Dépenses', Receipt],
  ['/stocks', 'Stocks', Fuel],
  ['/historiques/achats', 'Historiques', HistoryIcon],
  ['/rapports', 'Rapports', BarChart3],
  ['/parametres', 'Paramètres', Settings],
] as const;
export default function App() {
  const [token, setToken] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [api, setApi] = useState(false);
  const [apiError, setApiError] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const sessionUserRef = useRef<SessionUser | null>(null);
  const [toast, setToast] = useState('');
  const loc = useLocation();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(false);
  const [fuels, setFuels] = useState<AnyRow[]>([]);
  const [stockMovements, setStockMovements] = useState<AnyRow[]>([]);
  const [catsState, setCats] = useState<string[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [dailyRates, setDailyRates] = useState<AnyRow[]>([]);
  const [drivers, setDrivers] = useState<AnyRow[]>([]);
  const [companies, setCompanies] = useState<AnyRow[]>([]);
  const [items, setItems] = useState<Record<string, AnyRow[]>>({
    achats: [],
    ventes: [],
    depenses: [],
  });
  const [dash, setDash] = useState<AnyRow>({
    revenu: 0,
    depenses: 0,
    benefice: 0,
    stockTotal: 0,
    ventes: [],
    depensesCategories: [],
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [kind, setKind] = useState('');
  const [form, setForm] = useState<AnyRow>({});
  const [savingOperation, setSavingOperation] = useState(false);
  const [operationStatus, setOperationStatus] = useState('');
  const savingOperationRef = useRef(false);
  const operationIdempotency = useRef<{ payload: string; key: string } | null>(null);
  const deletionQueue = useRef<Promise<void>>(Promise.resolve());
  const refreshRequest = useRef<Promise<string> | null>(null);
  useEffect(() => {
    sessionUserRef.current = sessionUser;
  }, [sessionUser]);
  const renewAccessToken = useCallback(() => {
    if (!refreshRequest.current) {
      refreshRequest.current = fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Session expirée. Veuillez vous reconnecter.');
          const result = await response.json();
          setToken(result.token);
          if (result.user) {
            setSessionUser({
              email: result.user.email,
              role: result.user.role,
              impersonatedByEmail: result.user.impersonatedByEmail,
            });
          }
          return result.token as string;
        })
        .finally(() => {
          refreshRequest.current = null;
        });
    }
    return refreshRequest.current;
  }, []);
  useEffect(() => {
    void renewAccessToken()
      .catch(() => setToken(''))
      .finally(() => setSessionReady(true));
  }, []);
  const req = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const send = (accessToken: string) =>
        fetch(`/api${path}`, {
          ...init,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...init.headers,
          },
        });
      let r = await send(token);
      const authEndpointsWithoutRefresh = ['/auth/login', '/auth/refresh', '/auth/logout'];
      if (r.status === 401 && token && !authEndpointsWithoutRefresh.includes(path)) {
        if (sessionUserRef.current?.impersonatedByEmail) {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(
            () => undefined,
          );
          setToken('');
          setSessionUser(null);
        } else {
          try {
            r = await send(await renewAccessToken());
          } catch {
            setToken('');
            setSessionUser(null);
          }
        }
      }
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw Error(e.error || 'Erreur de connexion');
      }
      return r.status === 204 ? null : r.json();
    },
    [token, renewAccessToken],
  );
  const toastMsg = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 3200);
  };
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      try {
        const session = await req('/auth/me');
        const dashboardRequest =
          session.user.role === 'ADMIN'
            ? req('/dashboard')
            : Promise.resolve({
                revenu: 0,
                depenses: 0,
                benefice: 0,
                stockTotal: 0,
                ventes: [],
                depensesCategories: [],
              });
        const [f, cs, db, settings, rates, chauffeurRows, companyRows, movements] =
          await Promise.all(
            [
              req('/carburants'),
              req('/categories-depenses'),
              dashboardRequest,
              req('/parametres'),
              req('/parametres/taux'),
              req('/chauffeurs'),
              req('/entreprises'),
              req('/mouvements-stock'),
            ],
          );
        setFuels(f);
        setStockMovements(movements);
        setItems(db.operationsRecentes || { achats: [], ventes: [], depenses: [] });
        setCats(cs.map((x: AnyRow) => x.nom));
        setDash(db);
        setCurrency(settings.devise || 'USD');
        setDailyRates(rates);
        setDrivers(chauffeurRows);
        setCompanies(companyRows);
        setAccountEmail(session.user?.email || '');
        setSessionUser({
          email: session.user.email,
          role: session.user.role,
          impersonatedByEmail: session.user.impersonatedBy?.email,
        });
        setApi(true);
      } catch (error) {
        setApi(false);
        setApiError(error instanceof Error ? error.message : 'Erreur inconnue de l’API.');
        console.error('Échec du chargement initial de l’API :', error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [req, token]);
  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => undefined);
    setToken('');
    setAccountEmail('');
    setSessionUser(null);
    navigate('/connexion');
  };
  const refreshDrivers = async () => {
    const [chauffeurRows, companyRows, fuelRows, movements] = await Promise.all([
      req('/chauffeurs'),
      req('/entreprises'),
      req('/carburants'),
      req('/mouvements-stock'),
    ]);
    setDrivers(chauffeurRows);
    setCompanies(companyRows);
    setFuels(fuelRows);
    setStockMovements(movements);
  };
  const refreshInventory = async () => {
    const [fuelRows, movements] = await Promise.all([req('/carburants'), req('/mouvements-stock')]);
    setFuels(fuelRows);
    setStockMovements(movements);
  };
  const deleteRow = async (type: string, id: string) => {
    if (
      !confirm(
        'Supprimer d?finitivement cette op?ration ? Le stock sera recalcul? automatiquement.',
      )
    )
      return;

    const remove = async () => {
      try {
        await req(`/${type}/${id}`, { method: 'DELETE' });
        if (type === 'ventes') await refreshDrivers();
        else if (type === 'achats') await refreshInventory();
        setItems((current) => ({
          ...current,
          [type]: current[type as keyof typeof current].filter((row) => row.id !== id),
        }));
        toastMsg('Op?ration supprim?e avec succ?s.');
      } catch (e) {
        toastMsg((e as Error).message);
      }
    };

    const queued = deletionQueue.current.then(remove, remove);
    deletionQueue.current = queued;
    await queued;
  };
  const signIn = async (email: string, password: string) => {
    try {
      const r = await req('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(r.token);
      setAccountEmail(r.user?.email || email);
      setSessionUser(r.user);
      setSessionReady(true);
      navigate(r.user?.role === 'GERANT' ? '/ventes' : '/tableau-de-bord');
      toastMsg('Bienvenue.');
    } catch (e) {
      throw e;
    }
  };
  const switchToManager = async (email: string, adminPassword: string) => {
    const result = await req('/auth/switch-manager', {
      method: 'POST',
      body: JSON.stringify({ email, adminPassword }),
    });
    setToken(result.token);
    setAccountEmail(result.user.email);
    setSessionUser(result.user);
    navigate('/ventes');
    toastMsg('Mode gérant temporaire activé.');
  };
  const pageTitle = loc.pathname.includes('connexion')
    ? 'Connexion'
    : loc.pathname.includes('tableau')
      ? 'Tableau de bord'
      : loc.pathname.startsWith('/historiques')
        ? 'Historiques'
        : loc.pathname.slice(1).replace(/^./, (x) => x.toUpperCase());
  if (!sessionReady) return <LoadingState label="Restauration de la session…" />;
  if (!token && loc.pathname != '/connexion') return <Navigate to="/connexion" replace />;
  if (loc.pathname === '/connexion')
    return (
      <Suspense fallback={<LoadingState label="Chargement de la connexion…" />}>
        <Login onLogin={signIn} />
      </Suspense>
    );
  return (
    <div className="min-h-screen bg-canvas">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[250px] flex-col bg-ink px-4 pb-4 pt-6 text-white transition-transform lg:translate-x-0 ${mobile ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-3 px-3 pb-9">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500">
            <Fuel size={22} />
          </div>
          <div>
            <div className="title text-[17px] font-extrabold tracking-tight">
              BLESSING PETROLEUM
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">
              Gestion de station-service
            </div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setMobile(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">
          Espace de travail
        </div>
        <nav className="flex-1 space-y-1">
          {nav
            .filter(([to]) => sessionUser?.role === 'ADMIN' || to !== '/tableau-de-bord')
            .map(([to, label, Icon]) => (
            <Link
              onClick={() => setMobile(false)}
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-xl px-3 py-[11px] text-[13px] font-medium transition ${loc.pathname === to || (label === 'Historiques' && loc.pathname.startsWith('/historiques')) ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
              {label === 'Stocks' && (
                <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />
              )}
              {label === 'Historiques' && <ChevronDown className="ml-auto" size={15} />}
            </Link>
            ))}
        </nav>
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/[.045] p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
            <ShieldCheck size={14} className="text-emerald-400" /> Système sécurisé
          </div>
          <div className="text-[10px] leading-relaxed text-slate-400">
            Vos données sont protégées et synchronisées.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${api ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            <span className="text-[10px] text-slate-400">
              {loading
                ? 'Chargement des donn\u00e9es\u2026'
                : api
                  ? 'Connect\u00e9e \u00e0 la base'
                  : 'API indisponible'}
            </span>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut size={16} /> Se déconnecter
        </button>
      </aside>
      {mobile && (
        <div
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      )}
      <main className="min-h-screen lg:pl-[250px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-line bg-white/90 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobile(true)}>
              <Menu />
            </button>
            <div>
              <div className="title text-[17px] font-extrabold text-ink">{pageTitle}</div>
              <div className="mt-0.5 text-[11px] text-muted">BLESSING PETROLEUM · Lubumbashi</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:block">
              {new Intl.DateTimeFormat('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date())}
            </span>
            <button className="relative rounded-xl border border-line p-2 text-muted">
              <CircleHelp size={17} />
            </button>
            <div
              title={`${sessionUser?.role === 'ADMIN' ? 'Administrateur' : 'Gérant'} · ${accountEmail}`}
              aria-label={`Compte ${sessionUser?.role === 'ADMIN' ? 'administrateur' : 'gérant'} : ${accountEmail}`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700"
            >
              {accountEmail.slice(0, 2).toUpperCase() || 'G'}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-5 md:p-8">
          {sessionUser?.impersonatedByEmail && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <span>
                Mode gérant temporaire · ouvert par{' '}
                <strong>{sessionUser.impersonatedByEmail}</strong>
              </span>
              <button
                onClick={() => void logout()}
                className="rounded-lg border border-amber-400 px-3 py-1.5 font-semibold hover:bg-amber-100"
              >
                Quitter le mode gérant
              </button>
            </div>
          )}
          {!loading && !api && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              {apiError
                ? `Erreur API : ${apiError}`
                : 'Impossible de charger les données. Vérifiez que l’API est démarrée, puis actualisez la page.'}
            </div>
          )}
          {loading ? (
            <LoadingState />
          ) : (
            <Suspense fallback={<LoadingState label="Chargement du module…" />}>
              <Routes>
                <Route
                  path="/tableau-de-bord"
                  element={
                    sessionUser?.role === 'ADMIN' ? (
                      <Dashboard dash={dash} fuels={fuels} items={items} />
                    ) : (
                      <Navigate to="/ventes" replace />
                    )
                  }
                />
                <Route
                  path="/achats"
                  element={
                    <Operations
                      kind="achats"
                      rows={items.achats}
                      fuels={fuels}
                      query={query}
                      setQuery={setQuery}
                      page={page}
                      setPage={setPage}
                      open={() => {
                        setKind('achats');
                        setForm({
                          date: new Date().toISOString().slice(0, 10),
                          devise: currency,
                          carburantId: fuels[0]?.id,
                        });
                        operationIdempotency.current = null;
                        setModal(true);
                      }}
                      remove={deleteRow}
                      exportRows={exportRows}
                      req={req}
                    />
                  }
                />
                <Route
                  path="/ventes"
                  element={
                    <Operations
                      kind="ventes"
                      rows={items.ventes}
                      fuels={fuels}
                      query={query}
                      setQuery={setQuery}
                      page={page}
                      setPage={setPage}
                      open={() => {
                        setKind('ventes');
                        operationIdempotency.current = null;
                        setForm({
                          date: new Date().toISOString().slice(0, 10),
                          carburantId: fuels[0]?.id,
                          devise: currency,
                        });
                        setModal(true);
                      }}
                      chauffeurs={drivers}
                      remove={deleteRow}
                      exportRows={exportRows}
                      req={req}
                    />
                  }
                />
                <Route
                  path="/depenses"
                  element={
                    <Operations
                      kind="depenses"
                      rows={items.depenses}
                      fuels={fuels}
                      query={query}
                      setQuery={setQuery}
                      page={page}
                      setPage={setPage}
                      open={() => {
                        setKind('depenses');
                        operationIdempotency.current = null;
                        setForm({ date: new Date().toISOString().slice(0, 10), devise: currency });
                        setModal(true);
                      }}
                      remove={deleteRow}
                      exportRows={exportRows}
                      req={req}
                    />
                  }
                />
                <Route
                  path="/stocks"
                  element={<Stocks fuels={fuels} items={items} movements={stockMovements} />}
                />
                <Route
                  path="/chauffeurs"
                  element={
                    <Drivers
                      drivers={drivers}
                      companies={companies}
                      fuels={fuels}
                      defaultCurrency={currency}
                      rates={dailyRates}
                      req={req}
                      refresh={refreshDrivers}
                      toast={toastMsg}
                    />
                  }
                />
                <Route
                  path="/historiques/:type"
                  element={
                    <Operations
                      kind={
                        loc.pathname.split('/').pop() === 'achats'
                          ? 'achats'
                          : loc.pathname.split('/').pop() === 'ventes'
                            ? 'ventes'
                            : 'depenses'
                      }
                      rows={
                        items[
                          loc.pathname.split('/').pop() === 'achats'
                            ? 'achats'
                            : loc.pathname.split('/').pop() === 'ventes'
                              ? 'ventes'
                              : 'depenses'
                        ]
                      }
                      fuels={fuels}
                      query={query}
                      setQuery={setQuery}
                      page={page}
                      setPage={setPage}
                      open={() => {}}
                      remove={deleteRow}
                      exportRows={exportRows}
                      req={req}
                      historical
                    />
                  }
                />
                <Route path="/rapports" element={<Reports fuels={fuels} req={req} />} />
                <Route
                  path="/parametres"
                  element={
                    <SettingsPage
                      accountEmail={accountEmail}
                      role={sessionUser?.role || 'GERANT'}
                      fuels={fuels}
                      setFuels={setFuels}
                      cats={catsState}
                      setCats={setCats}
                      currency={currency}
                      setCurrency={setCurrency}
                      rates={dailyRates}
                      setRates={setDailyRates}
                      req={req}
                      toast={toastMsg}
                      onSessionRevoked={logout}
                      onSwitchManager={switchToManager}
                    />
                  }
                />
                <Route
                  path="*"
                  element={
                    <Navigate
                      to={sessionUser?.role === 'GERANT' ? '/ventes' : '/tableau-de-bord'}
                      replace
                    />
                  }
                />
              </Routes>
            </Suspense>
          )}
        </div>
      </main>
      {modal && (
        <OperationModal
          kind={kind}
          form={form}
          setForm={setForm}
          fuels={fuels}
          cats={catsState}
          rows={items}
          defaultCurrency={currency}
          rates={dailyRates}
          chauffeurs={drivers}
          companies={companies}
          saving={savingOperation}
          status={operationStatus}
          close={() => {
            if (savingOperationRef.current) return;
            setModal(false);
            operationIdempotency.current = null;
          }}
          save={async () => {
            if (savingOperationRef.current) return;
            savingOperationRef.current = true;
            setSavingOperation(true);
            setOperationStatus(
              kind === 'achats'
                ? 'Enregistrement de l’achat…'
                : kind === 'ventes'
                  ? 'Enregistrement de la vente…'
                  : 'Enregistrement de la dépense…',
            );
            try {
              const body = {
                ...form,
                quantite: kind !== 'depenses' ? Number(form.quantite) : undefined,
                prixUnitaire:
                  kind !== 'depenses' && form.prixUnitaire ? Number(form.prixUnitaire) : undefined,
                clientNom:
                  kind === 'ventes' && !form.chauffeurId
                    ? String(form.clientNom || '').trim() || undefined
                    : undefined,
                clientTelephone:
                  kind === 'ventes' && !form.chauffeurId
                    ? String(form.clientTelephone || '').trim() || undefined
                    : undefined,
                clientPlaque:
                  kind === 'ventes' && !form.chauffeurId
                    ? String(form.clientPlaque || '').trim() || undefined
                    : undefined,
                clientMarque:
                  kind === 'ventes' && !form.chauffeurId
                    ? String(form.clientMarque || '').trim() || undefined
                    : undefined,
                montant: Number(form.montant),
                date: new Date(form.date).toISOString(),
              };
              const fingerprint = JSON.stringify(body);
              if (operationIdempotency.current?.payload !== fingerprint) {
                operationIdempotency.current = { payload: fingerprint, key: crypto.randomUUID() };
              }
              const idempotencyKey = operationIdempotency.current.key;
              const row = await req(`/${kind}`, {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },
                body: JSON.stringify(body),
              });
              if (kind === 'ventes' && row.chauffeurId) {
                setOperationStatus('Génération du bordereau de sortie…');
                await downloadExitVoucher(row);
              }
              setItems((current) => ({
                ...current,
                [kind]: [
                  row,
                  ...current[kind as keyof typeof current].filter((item) => item.id !== row.id),
                ],
              }));
              if (kind === 'ventes' && form.chauffeurId) {
                setOperationStatus('Actualisation du compte chauffeur…');
                await refreshDrivers();
              }
              if (kind === 'achats' || (kind === 'ventes' && !form.chauffeurId)) {
                setOperationStatus('Mise à jour du stock…');
                await refreshInventory();
              }
              setModal(false);
              operationIdempotency.current = null;
              toastMsg('Enregistrement réalisé avec succès.');
            } catch (e) {
              toastMsg((e as Error).message);
            } finally {
              setOperationStatus('');
              savingOperationRef.current = false;
              setSavingOperation(false);
            }
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
