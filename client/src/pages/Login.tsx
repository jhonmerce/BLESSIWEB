import { useState } from 'react';
import { Fuel, ShieldCheck } from 'lucide-react';
import { Field, SavingLabel } from '../components/common';

export default function Login({ onLogin }: { onLogin: (e: string, p: string) => Promise<void> }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden w-1/2 flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500">
            <Fuel />
          </div>
          <div className="title text-xl font-extrabold">BLESSING PETROLEUM</div>
        </div>
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GESTION INTELLIGENTE DE
            STATION
          </div>
          <h1 className="title max-w-lg text-5xl font-extrabold leading-tight">
            Pilotez votre station avec <span className="text-blue-400">confiance.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
            Toutes vos opérations, vos stocks et vos performances financières réunis dans un espace
            unique.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          © 2026 Blessing Petroleum · Conçu pour les professionnels
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[390px]">
          <div className="mb-9 lg:hidden">
            <div className="title text-xl font-extrabold text-ink">BLESSING PETROLEUM</div>
          </div>
          <div className="mb-8">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-blue-600">
              Bienvenue
            </div>
            <h2 className="title text-3xl font-extrabold text-ink">Connectez-vous</h2>
            <p className="mt-2 text-sm text-muted">Accédez au tableau de bord de votre station.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (submitting) return;
              setSubmitting(true);
              setError('');
              void onLogin(email, password)
                .catch((loginError: unknown) => {
                  setError(
                    loginError instanceof Error ? loginError.message : 'Connexion impossible.',
                  );
                })
                .finally(() => setSubmitting(false));
            }}
            className="space-y-5"
          >
            <Field label="Adresse e-mail">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Mot de passe">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" className="text-[11px] font-semibold text-blue-600">
                Mot de passe oublié ?
              </button>
            </div>
            <button
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              <SavingLabel saving={submitting}>Se connecter</SavingLabel>
            </button>
          </form>
          <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-muted">
            <ShieldCheck size={14} className="text-emerald-600" /> Connexion sécurisée avec
            chiffrement
          </div>
          <div className="mt-12 text-center text-[10px] text-slate-400">
            © 2026 Blessing Petroleum. Tous droits réservés.
          </div>
        </div>
      </div>
    </div>
  );
}
