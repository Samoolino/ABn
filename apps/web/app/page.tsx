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

  async function refresh() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (response.ok) setStatus(await response.json());
    } catch { /* public landing remains available without engine connectivity */ }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, []);

  const engineReady = status.runtime !== 'STOPPED' && status.worker !== 'NOT_CONFIGURED';

  return (
    <main className="min-h-screen bg-[#060912] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 font-bold text-slate-950">A</div>
            <div><div className="font-semibold">ABn Engine</div><div className="text-xs text-slate-500">Arbitrage operations infrastructure</div></div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#architecture" className="hidden text-sm text-slate-400 hover:text-white sm:block">Architecture</a>
            <a href="/auth" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950">Sign in</a>
          </div>
        </nav>

        <section className="grid items-center gap-12 py-20 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.28em] text-cyan-400">OPPORTUNITY-DRIVEN EXECUTION</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl">A controlled arbitrage engine built around verified capital, execution safety and reconciliation.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">ABn does not initiate trades from a fixed amount. The engine evaluates profitable opportunities and derives executable size from verified available capital, venue liquidity, fees, slippage, risk limits and a safety reserve.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/auth" className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">Open secure workspace</a>
              <a href="#architecture" className="rounded-xl border border-slate-700 px-5 py-3 font-semibold">View architecture</a>
            </div>
            <p className="mt-5 text-xs text-amber-300">LIVE execution is not enabled from this public page. Engine controls require authenticated access and cannot bypass worker risk gates.</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/20">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-400">Engine telemetry</span><span className={engineReady ? 'rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300' : 'rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400'}>{engineReady ? 'ONLINE' : 'STANDBY'}</span></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Metric title="Runtime" value={status.runtime} />
              <Metric title="Worker" value={status.worker} />
              <Metric title="Opportunities" value={String(status.opportunities)} />
              <Metric title="Capital" value={status.capital == null ? 'NOT VERIFIED' : '$' + status.capital.toFixed(2)} />
            </div>
            <div className="mt-5 rounded-xl border border-slate-800 bg-[#060912] p-4 text-xs text-slate-400">
              <div className="flex justify-between"><span>Signer</span><span>{status.signer}</span></div>
              <div className="mt-3 flex justify-between"><span>Heartbeat</span><span>{status.lastHeartbeat ?? 'NOT VERIFIED'}</span></div>
            </div>
          </div>
        </section>

        <section id="architecture" className="border-y border-slate-800 py-16">
          <div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.25em] text-violet-300">EXECUTION ARCHITECTURE</p><h2 className="mt-4 text-3xl font-semibold">From verified capital to reconciled execution.</h2></div>
          <div className="mt-10 grid gap-4 md:grid-cols-5">
            {[
              ['01','Market intelligence','Live data and opportunity qualification.'],
              ['02','Capital authority','Protected signer, funded wallet authority, or approved external funding provider.'],
              ['03','Risk sizing','Capital, liquidity, fees, slippage and reserve determine size.'],
              ['04','Execution','CEX and DEX connectors submit controlled orders.'],
              ['05','Reconciliation','Fills, residual exposure, hedge/exit and realized PnL are reconciled.'],
            ].map(([n,title,copy]) => <article key={n} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"><span className="text-xs text-cyan-400">{n}</span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p></article>)}
          </div>
        </section>

        <section className="grid gap-6 py-16 lg:grid-cols-3">
          <Card title="Capital source flexibility" text="Select protected signer authority, approved funded-wallet authority, or an external provider API. Secrets remain server-side and encrypted; production should prefer non-exportable signer references." />
          <Card title="CEX + DEX connectivity" text="Connect approved exchange credentials and server-side RPC endpoints for supported networks without exposing credentials in the client bundle." />
          <Card title="Fail-closed operations" text="No profitable opportunity, insufficient capital, missing reconciliation, residual exposure failure or recovery failure prevents progression to funded LIVE execution." />
        </section>

        <footer className="border-t border-slate-800 py-8 text-xs text-slate-500">ABn Engine · Authenticated operations workspace required for configuration and controls.</footer>
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 bg-[#090d17] p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{title}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>;
}

function Card({ title, text }: { title: string; text: string }) {
  return <article className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"><h3 className="font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{text}</p></article>;
}
