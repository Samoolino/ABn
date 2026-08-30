'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { FundingIntegrationPanel } from './funding-integration-panel';

type Config = { id: string; kind: string; name: string; metadata: Record<string, unknown>; updated_at?: string };
type Runtime = { runtime: string; worker: string; hummingbot: string; signer: string; capital: unknown; opportunities: number; realizedPnl: unknown; lastHeartbeat: string | null };
type DryRun = { ok: boolean; mode: string; liveOrderSubmissionAllowed: boolean; checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'NOT_CONFIGURED'; detail: string }>; nextGate: string };

const venues = ['binance','kraken','okx','bybit','coinbase','kucoin','gate','mexc'];

export default function Dashboard() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [venue, setVenue] = useState('binance');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [signerRef, setSignerRef] = useState('');
  const [message, setMessage] = useState('');
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, s] = await Promise.all([fetch('/api/config'), fetch('/api/status')]);
    if (c.ok) setConfigs((await c.json()).configs ?? []);
    if (s.ok) setRuntime(await s.json());
  }

  useEffect(() => { void load(); const id = setInterval(() => void load(), 5000); return () => clearInterval(id); }, []);

  async function saveSecret(kind: string, name: string, secret: string, metadata: Record<string, unknown>) {
    const response = await fetch('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, name, secret, metadata }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Save failed');
  }

  async function saveExchange(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await saveSecret('cex_api_key', venue, apiKey, { venue, credential: 'api_key' });
      await saveSecret('cex_api_secret', venue, apiSecret, { venue, credential: 'api_secret' });
      if (passphrase) await saveSecret('cex_passphrase', venue, passphrase, { venue, credential: 'passphrase' });
      setApiKey(''); setApiSecret(''); setPassphrase('');
      setMessage(`${venue.toUpperCase()} credentials stored server-side. Values are never returned to the browser.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Credential save failed'); }
    finally { setBusy(false); }
  }

  async function saveSigner(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await saveSecret('signer_ref', 'primary', signerRef, { provider: 'protected-signer', exportablePrivateKey: false });
      setSignerRef(''); setMessage('Protected signer reference stored. Raw private keys are intentionally not accepted by the web UI.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Signer save failed'); }
    finally { setBusy(false); }
  }

  async function runDryRun() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/dry-run', { method: 'POST' });
      const data = await response.json();
      setDryRun(data);
      setMessage(data.ok ? 'DRY_RUN preflight passed. No live order was submitted.' : 'DRY_RUN preflight is incomplete. Review failed gates.');
    } finally { setBusy(false); }
  }

  const configuredVenues = useMemo(() => new Set(configs.filter(c => c.kind.startsWith('cex_')).map(c => String(c.metadata?.venue ?? c.name))), [configs]);

  return <main className="min-h-screen bg-[#070b12] text-slate-100">
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="border-b border-slate-800 pb-6">
        <p className="text-xs font-semibold tracking-[0.25em] text-cyan-400">ABn · ENGINE CONTROL</p>
        <h1 className="mt-2 text-3xl font-semibold">Capital, Scanner & Execution Console</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Opportunity-driven sizing, protected credentials, venue inventory checks and fail-closed execution. The browser never receives or exports a private key.</p>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Mode" value={runtime?.runtime ?? 'LOADING'} />
        <Card label="Worker" value={runtime?.worker ?? 'NOT_CONFIGURED'} />
        <Card label="Signer" value={runtime?.signer ?? 'NOT_CONFIGURED'} />
        <Card label="Qualified opportunities" value={String(runtime?.opportunities ?? 0)} />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Protected exchange onboarding">
          <form onSubmit={saveExchange} className="grid gap-3">
            <select value={venue} onChange={e => setVenue(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">{venues.map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}</select>
            <input required type="password" autoComplete="new-password" placeholder="API key" value={apiKey} onChange={e => setApiKey(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
            <input required type="password" autoComplete="new-password" placeholder="API secret" value={apiSecret} onChange={e => setApiSecret(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
            <input type="password" autoComplete="new-password" placeholder="Passphrase (only if venue requires it)" value={passphrase} onChange={e => setPassphrase(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
            <p className="text-xs text-amber-300">Use minimum permissions. Disable withdrawals, transfers and key-management permissions for DRY_RUN.</p>
            <button disabled={busy} className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Store protected credentials</button>
          </form>
        </Panel>

      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Venue readiness">
          <div className="grid gap-2">{venues.map(v => <div key={v} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2"><span>{v.toUpperCase()}</span><span className={configuredVenues.has(v) ? 'text-emerald-400' : 'text-slate-500'}>{configuredVenues.has(v) ? 'CREDENTIAL CONFIGURED' : 'NOT CONFIGURED'}</span></div>)}</div>
        </Panel>
        <Panel title="Capital & inventory">
          <div className="space-y-3 text-sm"><Row label="Capital" value={runtime?.capital == null ? 'NOT VERIFIED' : JSON.stringify(runtime.capital)} /><Row label="Venue inventory" value="Validated during DRY_RUN by engine connectors" /><Row label="Sizing" value="Opportunity + capital + liquidity + risk + reserve" /><Row label="Fixed initiation amount" value="DISABLED" /></div>
        </Panel>
        <Panel title="DRY_RUN release gate">
          <button onClick={runDryRun} disabled={busy} className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">Run DRY_RUN preflight</button>
          <p className="mt-3 text-xs text-slate-400">Preflight never authorizes live order submission. Live remains locked until explicit authorization after audit review.</p>
          {dryRun && <div className="mt-4 space-y-2">{dryRun.checks.map(c => <div key={c.name} className="rounded-lg border border-slate-800 p-2"><b className={c.status === 'PASS' ? 'text-emerald-400' : c.status === 'FAIL' ? 'text-red-400' : 'text-amber-300'}>{c.status}</b> <span className="ml-2">{c.name}</span><p className="mt-1 text-xs text-slate-400">{c.detail}</p></div>)}</div>}
        </Panel>
      </section>

      <section className="mt-5">
        <FundingIntegrationPanel saveSecret={saveSecret} onSaved={load} setMessage={setMessage} busy={busy} />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Live opportunity engine">
          <Pipeline />
          <p className="mt-4 text-sm text-slate-400">Scanner results must come from the engine's live market connectors. This UI does not fabricate opportunities.</p>
        </Panel>
        <Panel title="Recovery & reconciliation">
          <div className="space-y-3 text-sm text-slate-300"><p>Partial fills → cancel remainder → re-read actual fills → bounded hedge residual → reconcile.</p><p>Reconciliation must record intended quantity, observed fills, residual exposure, hedge quantity, fees and realized/simulated PnL.</p><p className="text-amber-300">Any unreconciled residual exposure remains fail-closed.</p></div>
        </Panel>
      </section>

      {message && <p className="mt-6 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm">{message}</p>}
    </div>
  </main>;
}

function Card({ label, value }: { label:string; value:string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-lg font-semibold">{value}</p></div>; }
function Panel({ title, children }: { title:string; children:React.ReactNode }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"><h2 className="font-semibold">{title}</h2><div className="mt-4">{children}</div></div>; }
function Row({ label, value }: { label:string; value:string }) { return <div className="flex justify-between gap-3"><span className="text-slate-500">{label}</span><span className="text-right">{value}</span></div>; }
function Pipeline() { return <div className="grid gap-2 text-sm">{['Live market scan','Executable opportunity validation','Capital + venue inventory verification','Opportunity-driven sizing','DRY_RUN execution plan','Recovery + reconciliation audit'].map((x, i) => <div key={x} className="flex items-center gap-3 rounded-lg border border-slate-800 px-4 py-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs">{i + 1}</span>{x}</div>)}</div>; }
