import type { CEXAdapter } from '@abn/venue-adapters';
import { createCEXAdapter } from '@abn/cex-adapters';

export type ExecutionPreflight = {
  venue: string;
  configured: boolean;
  authenticated: boolean;
  marketsLoaded: boolean;
  symbolSupported: boolean;
  balanceReadable: boolean;
  withdrawalsDisabled: boolean;
  reason?: string;
};

function credentialEnv(venue: string) {
  const p = venue.toUpperCase();
  return {
    apiKey: process.env[`${p}_API_KEY`] || '',
    secret: process.env[`${p}_API_SECRET`] || '',
    password: process.env[`${p}_PASSWORD`] || '',
  };
}

export async function cexPreflight(venue: string, symbol: string): Promise<ExecutionPreflight> {
  const credentials = credentialEnv(venue);
  if (!credentials.apiKey || !credentials.secret) {
    return { venue, configured: false, authenticated: false, marketsLoaded: false, symbolSupported: false, balanceReadable: false, withdrawalsDisabled: true, reason: 'CEX_CREDENTIALS_NOT_CONFIGURED' };
  }

  let adapter: CEXAdapter;
  try {
    adapter = createCEXAdapter(venue as any, credentials);
    await adapter.connect();
    const markets = await adapter.markets();
    const symbolSupported = markets.includes(symbol);
    if (!symbolSupported) {
      return { venue, configured: true, authenticated: true, marketsLoaded: true, symbolSupported: false, balanceReadable: false, withdrawalsDisabled: true, reason: 'SYMBOL_NOT_SUPPORTED' };
    }
    await adapter.balances();
    return { venue, configured: true, authenticated: true, marketsLoaded: true, symbolSupported: true, balanceReadable: true, withdrawalsDisabled: true };
  } catch (error) {
    return { venue, configured: true, authenticated: false, marketsLoaded: false, symbolSupported: false, balanceReadable: false, withdrawalsDisabled: true, reason: String(error) };
  }
}
