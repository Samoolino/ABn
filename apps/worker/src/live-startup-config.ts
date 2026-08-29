import { buildRegistryFromEnvironment, validateLiveStartup } from './live-startup-gate';

const NETWORKS = [
  ['ethereum', 1, 'ETHEREUM_RPC_URL'],
  ['arbitrum', 42161, 'ARBITRUM_RPC_URL'],
  ['base', 8453, 'BASE_RPC_URL'],
  ['polygon', 137, 'POLYGON_RPC_URL'],
  ['bsc', 56, 'BSC_RPC_URL'],
] as const;

export function validateWorkerLiveConfiguration(input: {
  mode: string;
  executionEnabled: boolean;
  signerConfigured: boolean;
}): ReturnType<typeof validateLiveStartup> {
  const registry = buildRegistryFromEnvironment({
    requiredNetworks: NETWORKS.map(([network, chainId, env]) => ({
      network,
      chainId,
      envRpc: process.env[env],
    })),
    tokens: [],
  });

  return validateLiveStartup({
    mode: input.mode,
    requiredNetworks: NETWORKS.map(([network]) => network),
    registry,
    expectedChainIds: Object.fromEntries(NETWORKS.map(([network, chainId]) => [network, chainId])),
    signerConfigured: input.signerConfigured,
    executionEnabled: input.executionEnabled,
  });
}
