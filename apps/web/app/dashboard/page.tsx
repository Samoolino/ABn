'use client';

import { FormEvent, useEffect, useState } from 'react';

type Config = { id: string; kind: string; name: string; metadata: Record<string, unknown> };

type Runtime = { runtime: string; worker: string; hummingbot: string; signer: string; capital: unknown; opportunities: number; realizedPnl: unknown; lastHeartbeat: string | null };

export default function Dashboard() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [kind, setKind] = useState('cex_api_key');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [metadata, setMetadata] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const [c, s] = await Promise.all([fetch('/api/config'), fetch('/api/status')]);
    if (c.ok) setConfigs((await c.json()).configs ?? []);
    if (s.ok) setRuntime(await s.json());
  }

  useEffect(() => { void load(); const id = setInterval(() => void load(), 5000); return () => clearInterval(id); }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); setMessage('');
    let parsed: Record<string, unknown> = {};
    try { parsed = metadata ? JSON.parse(metadata) : {}; } catch { setMessage('Metadata must be valid JSON'); return; }
    const response = await fetch('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, name, secret, metadata: parsed }) });
    const data = await response.json();
    setMessage(response.ok ? 'Saved encrypted server-side. Secret is never returned to the browser.' : data.error ?? 'Save failed');
    if (response.ok) { setSecret(''); await load(); }
  }

  return <main style={{ maxWidth: 1200, margin: '0 auto', padding: 32, fontFamily: 'system-ui' }}>
    <h1>ABn Production Arbitrage Dashboard</h1>
    <p>Protected configuration, live scanner state and trading controls.</p>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
      <article><b>Runtime</b><div>{runtime?.runtime ?? 'LOADING'}</div></article>
      <article><b>Worker</b><div>{runtime?.worker ?? 'NOT_CONFIGURED'}</div></article>
      <article><b>Hummingbot</b><div>{runtime?.hummingbot ?? 'NOT_CONFIGURED'}</div></article>
      <article><b>Signer</b><div>{runtime?.signer ?? 'NOT_CONFIGURED'}</div></article>
    </section>

    <section style={{ marginTop: 28 }}><h2>Secure API / RPC / Wallet Configuration</h2>
      <form onSubmit={save} style={{ display: 'grid', gap: 10, maxWidth: 700 }}>
        <select value={kind} onChange={e => setKind(e.target.value)}>
          <option value="cex_api_key">CEX API credential</option>
          <option value="dex_rpc">DEX / Network RPC credential</option>
          <option value="wallet_private_key">Funded wallet private key</option>
          <option value="hummingbot_api_key">Hummingbot API key</option>
          <option value="hummingbot_url">Hummingbot URL</option>
        </select>
        <input required placeholder="Name (e.g. binance, ethereum, trading-wallet)" value={name} onChange={e => setName(e.target.value)} />
        <input required type="password" autoComplete="new-password" placeholder="Secret / API key / RPC URL / private key" value={secret} onChange={e => setSecret(e.target.value)} />
        <textarea placeholder='Metadata JSON, e.g. {"network":"ethereum","chainId":1,"venue":"binance"}' value={metadata} onChange={e => setMetadata(e.target.value)} />
        <button type="submit">Save securely</button>
      </form>
      {message && <p>{message}</p>}
    </section>

    <section style={{ marginTop: 28 }}><h2>Configured Connections</h2>
      {configs.length === 0 ? <p>NOT_CONFIGURED</p> : <ul>{configs.map(c => <li key={c.id}>{c.kind} — {c.name}</li>)}</ul>}
    </section>

    <section style={{ marginTop: 28 }}><h2>Live Scan / Execution State</h2>
      <p>Opportunities: {runtime?.opportunities ?? 0}</p>
      <p>Capital: {runtime?.capital == null ? 'NOT_REPORTED' : JSON.stringify(runtime.capital)}</p>
      <p>Realized PnL: {runtime?.realizedPnl == null ? 'NOT_REPORTED' : JSON.stringify(runtime.realizedPnl)}</p>
      <p>Last worker heartbeat: {runtime?.lastHeartbeat ?? 'NOT_REPORTED'}</p>
      <p><strong>LIVE execution remains gated by the worker, protected signer, capital, opportunity and risk controls. The browser never signs or submits a trade directly.</strong></p>
    </section>
  </main>;
}
