import type { DexRuntimeRegistry } from './dex-runtime-registry';

export interface RuntimeConfigGateInput {
  registry: DexRuntimeRegistry;
  requiredNetworks: string[];
  requiredTokens: Array<{ network: string; symbol: string }>;
  expectedChainIds?: Record<string, number>;
}

export interface RuntimeConfigGateResult {
  ready: boolean;
  reason?: string;
}

/** Startup gate: validates execution configuration before an execution-capable worker is armed. */
export function validateExecutionRuntimeConfig(input: RuntimeConfigGateInput): RuntimeConfigGateResult {
  for (const network of input.requiredNetworks) {
    const id = network.trim().toLowerCase();
    const runtime = input.registry.networks[id];
    if (!runtime?.rpcUrl || !Number.isInteger(runtime.chainId) || runtime.chainId <= 0) {
      return { ready: false, reason: `RUNTIME_NETWORK_INVALID:${id}` };
    }
    const expected = input.expectedChainIds?.[id];
    if (expected !== undefined && runtime.chainId !== expected) {
      return { ready: false, reason: `RUNTIME_CHAIN_ID_MISMATCH:${id}` };
    }
  }

  for (const token of input.requiredTokens) {
    const network = token.network.trim().toLowerCase();
    const symbol = token.symbol.trim().toUpperCase();
    const entry = input.registry.tokens[`${network}:${symbol}`];
    const runtime = input.registry.networks[network];
    if (!runtime) return { ready: false, reason: `RUNTIME_TOKEN_NETWORK_INVALID:${network}` };
    if (!entry?.address || entry.chainId !== runtime.chainId) {
      return { ready: false, reason: `RUNTIME_TOKEN_INVALID:${network}:${symbol}` };
    }
  }

  return { ready: true };
}
