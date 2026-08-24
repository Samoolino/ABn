'use client';

import { useEffect, useState } from 'react';

interface Status {
  runtime: string;
  worker: string;
  hummingbot: string;
  signer: string;
  capital: number | null;
  opportunities: number;
  realizedPnl: number | null;
  lastHeartbeat: string | null;
}

const initial: Status = {
  runtime: 'STOPPED', worker: 'NOT_CONFIGURED', hummingbot: 'NOT_CONFIGURED',
  signer: 'NOT_CONFIGURED', capital: null, opportunities: 0,
  realizedPnl: null, lastHeartbeat: null,
};

export default function Home() {
  const [status, setStatus] = useState<Status>(initial);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (response.ok) setStatus(await response.json());
    } catch { /* keep last known state */ }
  }

  async function control(action: 'arm' | 'disarm' | 'emergency-stop') {
    setBusy(true);
    try { await fetch(`/api/${action}`, { method: 'POST' }); } finally { setBusy(false); refresh(); }
  }

  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, []);

  return (
    <main className="min-h-screen bg-[#070b12] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div><p className="text-xs font-semibold tracking-[0.25em] text-cyan-400">ABn · ARBITRAGE OPERATIONS</p><h1 className="mt-2 text-3xl font-semibold">Live Trading Control Center</h1><p className="mt-2 text-sm text-slate-400">Hummingbot market/execution services + persistent ABn worker + protected signer.</p></div>
          <div className="flex gap-2"><button disabled={busy} onClick={() => control('arm')} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">ARM</button><button disabled={busy} onClick={() => control('disarm')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">DISARM</button><button disabled={busy} onClick={() => control('emergency-stop')} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold">STOP</button></div>
        </header>

        <section className="grid gap-4 py-7 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Runtime', status.runtime], ['Worker', status.worker], ['Hummingbot', status.hummingbot], ['Signer', status.signer],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-lg font-semibold">{value}</p></div>)}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Metric title="Verified capital" value={status.capital == null ? 'NOT_VERIFIED' : `$${status.capital.toFixed(2)}`} />
          <Metric title="Qualified opportunities" value={String(status.opportunities)} />
          <Metric title="Realized PnL" value={status.realizedPnl == null ? 'NOT_VERIFIED' : `$${status.realizedPnl.toFixed(4)}`} />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="Execution pipeline"><Pipeline /></Panel>
          <Panel title="Safety gate"><p className="text-sm leading-6 text-slate-300">No trade is initiated from a fixed dollar amount. The engine sizes from verified funded capital and only executes when modeled net profit exceeds fees, gas, slippage, settlement costs and the safety reserve.</p><p className="mt-4 text-xs text-amber-300">A dashboard control cannot bypass the worker risk gate or protected signer.</p></Panel>
        </section>
        <p className="mt-6 text-xs text-slate-500">Heartbeat: {status.lastHeartbeat ?? 'NOT_VERIFIED'} · Dashboard refresh: 5s</p>
      </div>
    </main>
  );
}

function Metric({ title, value }: { title:string; value:string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{title}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function Panel({ title, children }: { title:string; children:React.ReactNode }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"><h2 className="font-semibold">{title}</h2><div className="mt-4">{children}</div></div>; }
function Pipeline() { return <div className="grid gap-2 text-sm">{['Live market data','Opportunity validation','Capital + risk gate','Hummingbot / venue execution','Reconciliation + realized PnL'].map((x, i) => <div key={x} className="flex items-center gap-3 rounded-lg border border-slate-800 px-4 py-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs">{i + 1}</span>{x}</div>)}</div>; }
