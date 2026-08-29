import { createDexGatewayClient, type DexGatewayClient } from './dex-gateway';

export interface DexRuntimeConfig {
  baseUrl?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  liveEnabled?: boolean;
}

export interface DexRuntimePreflight {
  ready: boolean;
  reason?: string;
  client?: DexGatewayClient;
}

/**
 * Creates a Gateway client only after explicit LIVE opt-in and a successful
 * health check. Missing configuration fails closed.
 */
export async function preflightDexGateway(config: DexRuntimeConfig): Promise<DexRuntimePreflight> {
  if (!config.liveEnabled) return { ready: false, reason: 'DEX_GATEWAY_EXECUTION_DISABLED' };
  if (!config.baseUrl) return { ready: false, reason: 'DEX_GATEWAY_URL_REQUIRED' };
  if (!config.username || !config.password) return { ready: false, reason: 'DEX_GATEWAY_AUTH_REQUIRED' };

  const client = createDexGatewayClient({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
    timeoutMs: config.timeoutMs,
  });

  if (!(await client.health())) return { ready: false, reason: 'DEX_GATEWAY_UNHEALTHY' };
  return { ready: true, client };
}
