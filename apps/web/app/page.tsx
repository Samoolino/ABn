import Link from 'next/link';

const metrics = [
  ['Runtime', 'STOPPED'],
  ['Worker', 'NOT_CONFIGURED'],
  ['Opportunities', '0'],
  ['Realized PnL', '$0.00'],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <p className="text-sm font-medium text-cyan-400">ABn / FREE CLOUD ARBITRAGE</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Arbitrage Operations Center</h1>
            <p className="mt-2 text-sm text-slate-400">Risk-adjusted execution across CEX and DEX venues.</p>
          </div>
          <Link className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900" href="/auth">Sign in</Link>
        </header>
        <section className="grid gap-4 py-8 md:grid-cols-4">
          {metrics.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>)}
        </section>
        <section className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-6">
          <h2 className="font-semibold text-amber-300">Trading safety gate</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Arbitrage is not risk-free. The execution engine must not trade unless modeled net profit exceeds all trading, gas, slippage, settlement and safety-reserve costs, and every risk gate passes.</p>
        </section>
      </div>
    </main>
  );
}
