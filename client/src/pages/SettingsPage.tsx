import { useEffect, useState } from 'react';
import { LoaderCircle, Plus, Settings } from 'lucide-react';
import type { AnyRow } from '../types';
import { Header, Field } from '../components/common';

export default function SettingsPage({
  accountEmail,
  role,
  fuels,
  setFuels,
  cats,
  setCats,
  currency,
  setCurrency,
  rates,
  setRates,
  req,
  toast,
  onSessionRevoked,
  onSwitchManager,
}: {
  accountEmail: string;
  role: 'ADMIN' | 'GERANT';
  fuels: AnyRow[];
  setFuels: (x: AnyRow[]) => void;
  cats: string[];
  setCats: (x: string[]) => void;
  currency: string;
  setCurrency: (x: string) => void;
  rates: AnyRow[];
  setRates: (x: AnyRow[]) => void;
  req: (p: string, i?: RequestInit) => Promise<any>;
  toast: (x: string) => void;
  onSessionRevoked: () => void | Promise<void>;
  onSwitchManager: (email: string, adminPassword: string) => Promise<void>;
}) {
  const [newcat, setNewcat] = useState('');
  const [currencyChoice, setCurrencyChoice] = useState(currency);
  const [rateDate, setRateDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [rateValue, setRateValue] = useState('');
  const [emailChange, setEmailChange] = useState({ email: accountEmail, currentPassword: '' });
  const [managerAccount, setManagerAccount] = useState({ exists: false, email: '' });
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerAdminPassword, setManagerAdminPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [pass, setPass] = useState({ current: '', next: '' });
  const [busyActions, setBusyActions] = useState<Record<string, boolean>>({});
  const setBusy = (key: string, busy: boolean) =>
    setBusyActions((current) => ({ ...current, [key]: busy }));

  useEffect(() => {
    if (role !== 'ADMIN') return;
    setBusy('manager-load', true);
    void req('/auth/manager-account')
      .then((account) => {
        setManagerAccount(account);
        setManagerEmail(account.email || '');
      })
      .catch((error) => toast((error as Error).message))
      .finally(() => setBusy('manager-load', false));
  }, [role, req]);
  return (
    <>
      <Header
        eyebrow="Configuration"
        title="Paramètres"
        subtitle="Personnalisez les carburants, catégories et préférences de votre station."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="title text-[15px] font-bold">Types de carburant & tarifs</h2>
          <p className="mb-5 mt-1 text-[11px] text-muted">
            Le prix par litre sert de valeur par défaut lors d’une vente.
          </p>
          <div className="space-y-3">
            {fuels.map((f, i) => (
              <div
                className="grid grid-cols-[1fr_110px_40px] items-center gap-3 rounded-xl border border-line p-3"
                key={f.id}
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.couleur }} />
                  {f.nom}
                </div>
                <input
                  type="number"
                  step=".01"
                  defaultValue={f.prixVente}
                  id={`price-${f.id}`}
                  className="w-full rounded-lg border border-line px-2 py-2 text-xs"
                />
                <button
                  onClick={async () => {
                    setBusy(f.id, true);
                    const el = document.getElementById(`price-${f.id}`) as HTMLInputElement;
                    try {
                      await req(`/carburants/${f.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ prixVente: Number(el.value) }),
                      });
                      setFuels(
                        fuels.map((x, j) => (j === i ? { ...x, prixVente: Number(el.value) } : x)),
                      );
                      toast('Prix mis à jour.');
                    } catch (e) {
                      toast((e as Error).message);
                    } finally {
                      setBusy(f.id, false);
                    }
                  }}
                  disabled={busyActions[f.id]}
                  aria-label={`Enregistrer le prix de ${f.nom}`}
                  aria-busy={busyActions[f.id] || undefined}
                  className="rounded-lg bg-blue-50 p-2 text-blue-600 disabled:cursor-wait disabled:opacity-50"
                >
                  {busyActions[f.id] ? (
                    <LoaderCircle className="animate-spin" size={15} />
                  ) : (
                    <Settings size={15} />
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <label className="text-[11px] font-semibold">Devise par defaut des operations</label>
            <select
              value={currencyChoice}
              onChange={(e) => setCurrencyChoice(e.target.value)}
              className="ml-3 rounded-lg border border-line px-3 py-2 text-xs"
            >
              <option value="USD">USD — Dollar américain</option>
              <option value="CDF">CDF — Franc congolais</option>
            </select>
            <button
              onClick={async () => {
                setBusy('currency', true);
                try {
                  await req('/parametres', {
                    method: 'PATCH',
                    body: JSON.stringify({ devise: currencyChoice }),
                  });
                  setCurrency(currencyChoice);
                  toast('Default operation currency saved.');
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy('currency', false);
                }
              }}
              disabled={busyActions.currency}
              aria-busy={busyActions.currency || undefined}
              className="ml-3 rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              {busyActions.currency ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <p className="mt-2 text-[10px] text-muted">
              Cette devise est preselectionnee dans les formulaires. Vous pouvez la changer pour
              chaque operation.
            </p>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-[11px] font-semibold">Taux journalier USD vers CDF</h3>
            <p className="mb-3 mt-1 text-[10px] text-muted">
              Saisissez le nombre de francs congolais pour 1 USD. Le taux est applique dans les deux
              sens et conserve sur chaque operation.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                type="date"
                value={rateDate}
                onChange={(event) => setRateDate(event.target.value)}
                className="rounded-lg border border-line px-3 py-2 text-xs"
              />
              <input
                type="number"
                min="0.000001"
                step="0.000001"
                value={rateValue}
                onChange={(event) => setRateValue(event.target.value)}
                placeholder="CDF pour 1 USD"
                className="rounded-lg border border-line px-3 py-2 text-xs disabled:bg-slate-50"
              />
              <button
                onClick={async () => {
                  setBusy('rate', true);
                  try {
                    const saved = await req('/parametres/taux', {
                      method: 'POST',
                      body: JSON.stringify({
                        date: rateDate,
                        deviseCible: 'CDF',
                        taux: Number(rateValue),
                      }),
                    });
                    setRates([
                      saved,
                      ...rates.filter(
                        (rate) =>
                          !(rate.date.slice(0, 10) === rateDate && rate.deviseCible === 'CDF'),
                      ),
                    ]);
                    toast('Taux journalier enregistré.');
                  } catch (e) {
                    toast((e as Error).message);
                  } finally {
                    setBusy('rate', false);
                  }
                }}
                disabled={busyActions.rate || !rateValue || Number(rateValue) <= 0}
                aria-busy={busyActions.rate || undefined}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {busyActions.rate ? 'Enregistrement…' : 'Enregistrer le taux'}
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {rates
                .filter((rate) => rate.deviseCible === 'CDF')
                .map((rate) => (
                  <div
                    className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-[10px]"
                    key={rate.id}
                  >
                    <span>{new Date(rate.date).toLocaleDateString('fr-FR')}</span>
                    <span className="font-semibold">1 USD = {Number(rate.taux)} CDF</span>
                  </div>
                ))}
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="title text-[15px] font-bold">Catégories de dépenses</h2>
          <p className="mb-4 mt-1 text-[11px] text-muted">
            Ajoutez les catégories adaptées à votre activité.
          </p>
          <div className="mb-4 flex gap-2">
            <input
              value={newcat}
              onChange={(e) => setNewcat(e.target.value)}
              placeholder="Nouvelle catégorie"
              className="flex-1 rounded-lg border border-line px-3 py-2 text-xs"
            />
            <button
              onClick={async () => {
                if (!newcat.trim()) return;
                setBusy('category', true);
                try {
                  const created = await req('/categories-depenses', {
                    method: 'POST',
                    body: JSON.stringify({ nom: newcat.trim() }),
                  });
                  setCats([...cats, created.nom]);
                  setNewcat('');
                  toast('Catégorie ajoutée.');
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy('category', false);
                }
              }}
              disabled={busyActions.category || !newcat.trim()}
              aria-label="Ajouter la catégorie"
              aria-busy={busyActions.category || undefined}
              className="rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busyActions.category ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Plus size={15} />
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cats.map((x) => (
              <span
                key={x}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-slate-700"
              >
                {x}
              </span>
            ))}
          </div>
          <div className="mt-7 border-t border-line pt-5">
            <h2 className="title text-[15px] font-bold">
              {role === 'ADMIN' ? 'Compte administrateur' : 'Compte du gérant'}
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Connecté avec <strong className="text-ink">{accountEmail || '—'}</strong>. Modifiez
              l’adresse de connexion après vérification de votre mot de passe. La modification
              fermera votre session.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                value={emailChange.email}
                onChange={(event) => setEmailChange({ ...emailChange, email: event.target.value })}
                autoComplete="email"
                maxLength={254}
                placeholder="Nouvelle adresse e-mail"
                aria-label="Nouvelle adresse e-mail du gérant"
                className="rounded-lg border border-line px-3 py-2.5 text-xs"
              />
              <input
                type="password"
                value={emailChange.currentPassword}
                onChange={(event) =>
                  setEmailChange({ ...emailChange, currentPassword: event.target.value })
                }
                autoComplete="current-password"
                placeholder="Mot de passe actuel"
                aria-label="Mot de passe actuel pour changer l’adresse e-mail"
                className="rounded-lg border border-line px-3 py-2.5 text-xs"
              />
            </div>
            <button
              onClick={async () => {
                setBusy('email', true);
                try {
                  await req('/auth/email', {
                    method: 'PATCH',
                    body: JSON.stringify(emailChange),
                  });
                  toast('Adresse e-mail modifiée. Connectez-vous avec la nouvelle adresse.');
                  await onSessionRevoked();
                } catch (error) {
                  toast((error as Error).message);
                } finally {
                  setBusy('email', false);
                }
              }}
              disabled={
                busyActions.email ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(emailChange.email.trim()) ||
                !emailChange.currentPassword ||
                emailChange.email.trim().toLowerCase() === accountEmail.toLowerCase()
              }
              aria-busy={busyActions.email || undefined}
              className="mt-3 rounded-lg bg-ink px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busyActions.email ? 'Modification…' : 'Modifier l’adresse e-mail'}
            </button>

            <h3 className="mt-6 border-t border-line pt-5 text-[13px] font-bold">Mot de passe</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={pass.current}
                onChange={(e) => setPass({ ...pass, current: e.target.value })}
                type="password"
                placeholder="Mot de passe actuel"
                className="rounded-lg border border-line px-3 py-2.5 text-xs"
              />
              <input
                value={pass.next}
                onChange={(e) => setPass({ ...pass, next: e.target.value })}
                type="password"
                placeholder="Nouveau mot de passe (12+ caractères)"
                minLength={12}
                maxLength={256}
                className="rounded-lg border border-line px-3 py-2.5 text-xs"
              />
            </div>
            <button
              onClick={async () => {
                setBusy('password', true);
                try {
                  await req('/auth/password', {
                    method: 'PATCH',
                    body: JSON.stringify({ current: pass.current, password: pass.next }),
                  });
                  setPass({ current: '', next: '' });
                  toast('Mot de passe modifié.');
                  await onSessionRevoked();
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy('password', false);
                }
              }}
              disabled={busyActions.password || pass.current.length === 0 || pass.next.length < 12}
              aria-busy={busyActions.password || undefined}
              className="mt-3 rounded-lg bg-ink px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busyActions.password ? 'Modification…' : 'Modifier le mot de passe'}
            </button>

            {role === 'ADMIN' && (
              <section className="mt-7 border-t border-line pt-5">
                <h2 className="title text-[15px] font-bold">Accès au compte gérant</h2>
                <p className="mt-1 text-[11px] text-muted">
                  Créez ou mettez à jour les identifiants propres au gérant. Son mot de passe est
                  haché avec bcrypt et ne peut pas être relu ici.
                </p>
                {busyActions['manager-load'] ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted" role="status">
                    <LoaderCircle size={14} className="animate-spin" /> Chargement du compte gérant…
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input
                        type="email"
                        value={managerEmail}
                        onChange={(event) => setManagerEmail(event.target.value)}
                        autoComplete="off"
                        maxLength={254}
                        placeholder="E-mail du gérant"
                        aria-label="E-mail du compte gérant"
                        className="rounded-lg border border-line px-3 py-2.5 text-xs"
                      />
                      <input
                        type="password"
                        value={managerPassword}
                        onChange={(event) => setManagerPassword(event.target.value)}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={256}
                        placeholder={
                          managerAccount.exists
                            ? 'Nouveau mot de passe (facultatif)'
                            : 'Mot de passe (12 caractères minimum)'
                        }
                        aria-label="Mot de passe du compte gérant"
                        className="rounded-lg border border-line px-3 py-2.5 text-xs"
                      />
                      <input
                        type="password"
                        value={managerAdminPassword}
                        onChange={(event) => setManagerAdminPassword(event.target.value)}
                        autoComplete="current-password"
                        placeholder="Confirmer avec votre mot de passe admin"
                        aria-label="Mot de passe administrateur pour gérer le compte gérant"
                        className="rounded-lg border border-line px-3 py-2.5 text-xs sm:col-span-2"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        setBusy('manager-save', true);
                        try {
                          const updated = await req('/auth/manager-account', {
                            method: 'PUT',
                            body: JSON.stringify({
                              email: managerEmail,
                              adminPassword: managerAdminPassword,
                              ...(managerPassword ? { password: managerPassword } : {}),
                            }),
                          });
                          setManagerAccount(updated);
                          setManagerEmail(updated.email);
                          setManagerPassword('');
                          setManagerAdminPassword('');
                          toast('Compte gérant enregistré.');
                        } catch (error) {
                          toast((error as Error).message);
                        } finally {
                          setBusy('manager-save', false);
                        }
                      }}
                      disabled={
                        busyActions['manager-save'] ||
                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(managerEmail.trim()) ||
                        (!managerAccount.exists && managerPassword.length < 12) ||
                        (managerPassword.length > 0 && managerPassword.length < 12) ||
                        !managerAdminPassword
                      }
                      aria-busy={busyActions['manager-save'] || undefined}
                      className="mt-3 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busyActions['manager-save']
                        ? 'Enregistrement…'
                        : 'Enregistrer le compte gérant'}
                    </button>

                    {managerAccount.exists && (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <h3 className="text-xs font-bold text-amber-950">
                          Ouvrir une session gérant
                        </h3>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-900">
                          Vérifiez votre mot de passe administrateur. La session gérant sera
                          temporaire, limitée à 10 minutes et signalée dans l’application.
                        </p>
                        <input
                          type="password"
                          value={adminPassword}
                          onChange={(event) => setAdminPassword(event.target.value)}
                          autoComplete="current-password"
                          placeholder="Votre mot de passe administrateur"
                          aria-label="Mot de passe administrateur pour ouvrir le compte gérant"
                          className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-xs"
                        />
                        <button
                          onClick={async () => {
                            setBusy('manager-switch', true);
                            try {
                              await onSwitchManager(managerAccount.email, adminPassword);
                              setAdminPassword('');
                            } catch (error) {
                              toast((error as Error).message);
                            } finally {
                              setBusy('manager-switch', false);
                            }
                          }}
                          disabled={busyActions['manager-switch'] || !adminPassword}
                          aria-busy={busyActions['manager-switch'] || undefined}
                          className="mt-3 rounded-lg border border-amber-400 px-4 py-2.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
                        >
                          {busyActions['manager-switch'] ? 'Ouverture…' : 'Ouvrir le compte gérant'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
