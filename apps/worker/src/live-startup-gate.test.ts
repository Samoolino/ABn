import { describe, expect, it } from 'vitest';
import { buildRegistryFromEnvironment, validateLiveStartup } from './live-startup-gate';

const networks = [
  { network: 'ethereum', chainId: 1, envRpc: 'https://example.invalid/eth' },
  { network: 'arbitrum', chainId: 42161, envRpc: 'https://example.invalid/arb' },
  { network: 'base', chainId: 8453, envRpc: 'https://example.invalid/base' },
  { network: 'polygon', chainId: 137, envRpc: 'https://example.invalid/polygon' },
  { network: 'bsc', chainId: 56, envRpc: 'https://example.invalid/bsc' },
];

describe('validateLiveStartup', () => {
  it('allows non-LIVE modes without signer or RPC requirements', () => {
    const registry = buildRegistryFromEnvironment({ requiredNetworks: [], tokens: [] });
    expect(validateLiveStartup({ mode: 'DRY_RUN', requiredNetworks: [], registry, signerConfigured: false, executionEnabled: false, hummingbotConfigured: false })).toEqual({ allowed: true, mode: 'DRY_RUN', reasons: [] });
  });

  it('fails closed when LIVE execution is disabled', () => {
    const registry = buildRegistryFromEnvironment({ requiredNetworks: networks, tokens: [] });
    const result = validateLiveStartup({ mode: 'LIVE', requiredNetworks: networks.map(n => n.network), registry, signerConfigured: true, executionEnabled: false, hummingbotConfigured: true });
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('DRY_RUN');
    expect(result.reasons).toContain('LIVE_EXECUTION_DISABLED');
  });

  it('fails closed when Hummingbot is not configured', () => {
    const registry = buildRegistryFromEnvironment({ requiredNetworks: networks, tokens: [] });
    const result = validateLiveStartup({ mode: 'LIVE', requiredNetworks: networks.map(n => n.network), registry, signerConfigured: true, executionEnabled: true, hummingbotConfigured: false });
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('DRY_RUN');
    expect(result.reasons).toContain('HUMMINGBOT_CONFIGURATION_REQUIRED');
  });

  it('fails closed on a missing RPC', () => {
    const missing = networks.map(n => n.network === 'base' ? { ...n, envRpc: undefined } : n);
    const registry = buildRegistryFromEnvironment({ requiredNetworks: missing, tokens: [] });
    const result = validateLiveStartup({ mode: 'LIVE', requiredNetworks: missing.map(n => n.network), registry, signerConfigured: true, executionEnabled: true, hummingbotConfigured: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('RPC_NOT_CONFIGURED:base');
  });

  it('fails closed on chain-id mismatch', () => {
    const registry = buildRegistryFromEnvironment({ requiredNetworks: networks, tokens: [] });
    const result = validateLiveStartup({ mode: 'LIVE', requiredNetworks: networks.map(n => n.network), registry, expectedChainIds: { ethereum: 1, arbitrum: 42161, base: 1, polygon: 137, bsc: 56 }, signerConfigured: true, executionEnabled: true, hummingbotConfigured: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('CHAIN_ID_MISMATCH:base:8453:1');
  });

  it('allows LIVE only when every required runtime check passes', () => {
    const registry = buildRegistryFromEnvironment({ requiredNetworks: networks, tokens: [] });
    const result = validateLiveStartup({ mode: 'LIVE', requiredNetworks: networks.map(n => n.network), expectedChainIds: Object.fromEntries(networks.map(n => [n.network, n.chainId])), registry, signerConfigured: true, executionEnabled: true, hummingbotConfigured: true });
    expect(result).toEqual({ allowed: true, mode: 'LIVE', reasons: [] });
  });
});
