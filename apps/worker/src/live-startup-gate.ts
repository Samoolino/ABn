import type { DexRuntimeRegistry } from '@abn/execution';
import { createDexRuntimeRegistry } from '@abn/execution';

export interface LiveStartupGateInput {
  mode: string;
  requiredNetworks: string[];
  registry: DexRuntimeRegistry;
  expectedChainIds?: Record<string, number>;
  signerConfigured: boolean;
  executionEnabled: boolean;
}

export interface LiveStartupGateResult {
  allowed: boolean;
  mode: 'LIVE' | 'DRY_RUN' | 'STOPPED';
  reasons: string[];
}

export function validateLiveStartup(input: LiveStartupGateInput): LiveStartupGateResult {
  const reasons: string[] = [];
  const liveRequested = input.mode.toUpperCase() === 'LIVE';

  if (!liveRequested) return { allowed: true, mode: input.mode.toUpperCase() === 'DRY_RUN' ? 'DRY_RUN' : 'STOPPED', reasons };
  if (!input.executionEnabled) reasons.push('LIVE_EXECUTION_DISABLED');
  if (!input.signerConfigured) reasons.push('SIGNER_NOT_CONFIGURED');

  for (const network of input.requiredNetworks) {
    const id = network.trim().toLowerCase();
    const runtime = input.registry.networks[id];
    if (!runtime) {
      reasons.push(`NETWORK_NOT_REGISTERED:${id}`);
      continue;
    }
    if (!runtime.rpcUrl) reasons.push(`RPC_NOT_CONFIGURED:${id}`);
    const expected = input.expectedChainIds?.[id];
    if (expected !== undefined && runtime.chainId !== expected) {
      reasons.push(`CHAIN_ID_MISMATCH:${id}:${runtime.chainId}:${expected}`);
    }
  }

  if (reasons.length) return { allowed: false, mode: 'DRY_RUN', reasons };
  return { allowed: true, mode: 'LIVE', reasons };
}

export function buildRegistryFromEnvironment(input: {
  requiredNetworks: Array<{ network: string; chainId: number; envRpc: string | undefined }>;
  tokens: Array<{ network: string; chainId: number; symbol: string; address: string | undefined }>;
}): DexRuntimeRegistry {
  return createDexRuntimeRegistry({
    networks: input.requiredNetworks.map(n => ({ network: n.network, chainId: n.chainId, rpcUrl: n.envRpc ?? '' })),
    tokens: input.tokens.map(t => ({ network: t.network, chainId: t.chainId, symbol: t.symbol, address: t.address ?? '' })),
  });
}
