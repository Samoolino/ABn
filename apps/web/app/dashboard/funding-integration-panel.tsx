'use client';

import { FormEvent, useState } from 'react';

const networks = [
  ['Ethereum','eth','CORE'],['Arbitrum','arb','CORE'],['Base','base','CORE'],
  ['Polygon','polygon','CORE'],['BNB Smart Chain','bsc','CORE'],
  ['Optimism','optimism','ONBOARDING'],['Avalanche','avax','ONBOARDING'],
  ['zkSync Era','zksync','ONBOARDING'],['Linea','linea','ONBOARDING'],
  ['Scroll','scroll','ONBOARDING']
] as const;

type Props = {
  saveSecret: (kind: string, name: string, secret: string, metadata: Record<string, unknown>) => Promise<void>;
  onSaved: () => Promise<void>;
  setMessage: (message: string) => void;
  busy: boolean;
};

export function FundingIntegrationPanel({ saveSecret, onSaved, setMessage, busy }: Props) {
  const [source, setSource] = useState<'wallet_private_key'|'signer_ref'|'fund_provider_api'>('signer_ref');
  const [value, setValue] = useState('');
  const [provider, setProvider] = useState('');
  const [rpcNetwork, setRpcNetwork] = useState('eth');
  const [rpcUrl, setRpcUrl] = useState('');

  async function saveFunding(event: FormEvent) {
    event.preventDefault();
    const kind = source === 'fund_provider_api' ? 'fund_provider_api_key' : source;
    await saveSecret(kind, source === 'fund_provider_api' ? provider || 'fund-provider' : 'primary', value, {
      source,
      provider: provider || undefined,
      preferredForProduction: source === 'signer_ref'
    });
    setValue('');
    setMessage(source === 'wallet_private_key'
      ? 'Wallet key stored encrypted server-side only and never returned. Prefer protected signer references for production.'
      : 'Funding source configuration stored securely.');
    await onSaved();
  }

  async function saveRpc(event: FormEvent) {
    event.preventDefault();
    const network = networks.find(([, id]) => id === rpcNetwork)?.[0] ?? rpcNetwork;
    await saveSecret('dex_rpc', rpcNetwork, rpcUrl, { network, chain: rpcNetwork });
    setRpcUrl('');
    setMessage(network + ' RPC stored server-side for DEX quote and execution integration.');
    await onSaved();
  }

  return <div className="grid gap-5 lg:grid-cols-2">
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="font-semibold">Fund source authority</h2>
      <p className="mt-2 text-sm text-slate-400">Select the capital authority used by the engine. Trade size remains opportunity-driven and limited by verified available capital, liquidity, risk limits and reserve.</p>
      <form onSubmit={saveFunding} className="mt-4 grid gap-3">
        <select value={source} onChange={e => setSource(e.target.value as typeof source)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
          <option value="signer_ref">Protected signer / Vault / HSM reference</option>
          <option value="wallet_private_key">Funded wallet key (encrypted server-side)</option>
          <option value="fund_provider_api">External fund/provider API</option>
        </select>
        {source === 'fund_provider_api' && <input required placeholder="Provider name" value={provider} onChange={e => setProvider(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />}
        <input required type={source === 'wallet_private_key' ? 'password' : 'text'} autoComplete="off"
          placeholder={source === 'signer_ref' ? 'Vault URI, HSM key ID, or protected signer reference' : source === 'wallet_private_key' ? 'Funded wallet private key — server-side only' : 'Provider API credential'}
          value={value} onChange={e => setValue(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
        <p className="text-xs text-amber-300">Secrets are encrypted server-side and never returned to the browser. Production should prefer a non-exportable signer reference; do not use a wallet key with unnecessary permissions or funds.</p>
        <button disabled={busy} className="rounded-lg border border-cyan-500 px-4 py-2 font-semibold text-cyan-300 disabled:opacity-50">Register fund source</button>
      </form>
    </div>

    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="font-semibold">DEX RPC integration</h2>
      <p className="mt-2 text-sm text-slate-400">RPC endpoints are used server-side for quotes, gas estimation, pool reads and execution verification. CORE networks are primary integration targets; ONBOARDING networks remain connector candidates until the live engine validates routing and execution support. RPC URLs are not exposed as public client environment variables.</p>
      <form onSubmit={saveRpc} className="mt-4 grid gap-3">
        <select value={rpcNetwork} onChange={e => setRpcNetwork(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
          {networks.map(([name,id,tier]) => <option key={id} value={id}>{name} · {tier}</option>)}
        </select>
        <input required type="url" placeholder="https://secure-rpc-provider.example" value={rpcUrl} onChange={e => setRpcUrl(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
        <button disabled={busy} className="rounded-lg bg-violet-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Store RPC endpoint</button>
      </form>
    </div>
  </div>;
}
