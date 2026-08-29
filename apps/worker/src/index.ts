import crypto from 'node:crypto';
import { createDatabasePool } from '@abn/database';
import { createRedisClient } from '@abn/redis';
import { fundedCapitalPolicy } from '@abn/capital-engine';
import { signerRefConfigured, loadProtectedSignerImplementation } from '@abn/signer';
import type { FundedSigner } from '@abn/signer';
import { createCEXAdapterFromEnv, createCEXPairExecutionConnector, executePair, validateCoordinatedOpportunity } from '@abn/execution';
import type { CEXAdapter } from '@abn/venue-adapters';
import type { Opportunity } from '@abn/types';

const requestedMode = process.env.TRADING_MODE || process.env.RUNTIME_MODE || 'STOPPED';
const interval = Number(process.env.HEARTBEAT_MS || 5000);
const db = createDatabasePool();
const redis = createRedisClient();
const policy = fundedCapitalPolicy();
const safetyReserve = Number(process.env.SAFETY_RESERVE_USD || policy.minReserveUsd);
const executionEnabled = process.env.EXECUTION_ENABLED === 'true';
const maxUnhedgedMs = Number(process.env.MAX_UNHEDGED_TIME_MS || '1500');
const maxQuoteAgeMs = Number(process.env.MAX_QUOTE_AGE_MS || '1500');
const requiredCapitalSource = process.env.CAPITAL_SOURCE || 'FUNDED_INVENTORY';
const signerNetwork = process.env.SIGNER_BALANCE_NETWORK || 'ethereum';
const capitalAsset = process.env.CAPITAL_ASSET || 'USDC';
const capitalAssetUsdRate = Number(process.env.CAPITAL_ASSET_USD_RATE || '1');

let mode = requestedMode;
let controlStatus = 'STOPPED';
let executing = false;
let fundedSigner: FundedSigner | null = null;
let signerVerification: { address: string; balance: number; usdEquivalent: number } | null = null;

function signerReady() { return signerRefConfigured(); }
function isCexVenue(venue: string) {
  return ['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank'].includes(venue.toLowerCase());
}

function splitSymbol(symbol: string): { base: string; quote: string } {
  const normalized = symbol.trim().toUpperCase().replace('-', '/');
  const parts = normalized.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`SYMBOL_UNSUPPORTED_FOR_BALANCE_GATE:${symbol}`);
  return { base: parts[0], quote: parts[1] };
}

function balanceOf(balances: Record<string, number>, asset: string): number {
  const target = asset.toUpperCase();
  const key = Object.keys(balances).find(k => k.toUpperCase() === target);
  const value = key ? Number(balances[key]) : 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function verifyCexInventory(
  buyAdapter: CEXAdapter,
  sellAdapter: CEXAdapter,
  opportunity: Opportunity,
): Promise<{ buyQuoteBalance: number; sellBaseBalance: number; source: string }> {
  const { base, quote } = splitSymbol(opportunity.symbol);
  const [buyBalances, sellBalances] = await Promise.all([buyAdapter.balances(), sellAdapter.balances()]);
  const buyQuoteBalance = balanceOf(buyBalances, quote);
  const sellBaseBalance = balanceOf(sellBalances, base);
  const requiredQuote = Number(opportunity.capitalRequired);
  const requiredBase = Number(opportunity.quantity);

  if (!Number.isFinite(requiredQuote) || requiredQuote <= 0) throw new Error('CEX_BUY_CAPITAL_REQUIRED_INVALID');
  if (!Number.isFinite(requiredBase) || requiredBase <= 0) throw new Error('CEX_SELL_QUANTITY_INVALID');
  if (buyQuoteBalance < requiredQuote + safetyReserve) {
    throw new Error(`INSUFFICIENT_CEX_BUY_QUOTE:${buyAdapter.name}:${quote}:${buyQuoteBalance}:required=${requiredQuote}:reserve=${safetyReserve}`);
  }
  if (sellBaseBalance < requiredBase) {
    throw new Error(`INSUFFICIENT_CEX_SELL_BASE:${sellAdapter.name}:${base}:${sellBaseBalance}:required=${requiredBase}`);
  }

  return { buyQuoteBalance, sellBaseBalance, source: 'CEX_ACCOUNT_BALANCES' };
}

async function resolveAndVerifySigner(requiredUsd: number) {
  if (!signerReady()) throw new Error('SIGNER_NOT_CONFIGURED');
  if (!Number.isFinite(capitalAssetUsdRate) || capitalAssetUsdRate <= 0) throw new Error('CAPITAL_ASSET_USD_RATE_INVALID');
  const implementation = await loadProtectedSignerImplementation();
  const ref = process.env.TRADING_SIGNER_REF!;
  const kind = ref.split('://', 1)[0];
  fundedSigner = await implementation(ref, kind.toUpperCase() as FundedSigner['kind']);
  const address = await fundedSigner.address(signerNetwork);
  if (!address) throw new Error('SIGNER_ADDRESS_UNAVAILABLE');
  const balance = await fundedSigner.balance(signerNetwork, capitalAsset);
  const usdEquivalent = balance * capitalAssetUsdRate;
  if (!Number.isFinite(balance) || balance < 0 || !Number.isFinite(usdEquivalent)) throw new Error('SIGNER_BALANCE_UNAVAILABLE');
  if (usdEquivalent < requiredUsd + safetyReserve) {
    throw new Error(`INSUFFICIENT_FUNDED_WALLET:usd=${usdEquivalent}:required=${requiredUsd}:reserve=${safetyReserve}`);
  }
  signerVerification = { address, balance, usdEquivalent };
  return signerVerification;
}

function mapOpportunity(row: Record<string, unknown>): Opportunity {
  const netProfit = Number(row.net_profit ?? row.expected_net_profit ?? 0);
  return {
    id: String(row.id),
    correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
    symbol: String(row.symbol),
    buyVenue: String(row.buy_venue),
    sellVenue: String(row.sell_venue),
    buyNetwork: row.buy_network ? String(row.buy_network) : undefined,
    sellNetwork: row.sell_network ? String(row.sell_network) : undefined,
    quantity: Number(row.quantity),
    grossProfit: Number(row.gross_profit || 0),
    tradingFees: Number(row.trading_fees || 0),
    gasCost: Number(row.gas_cost || 0),
    slippageCost: Number(row.slippage_cost || 0),
    bridgeCost: Number(row.bridge_cost || 0),
    settlementCost: Number(row.settlement_cost || 0),
    safetyReserve: Number(row.safety_reserve || safetyReserve),
    netProfit,
    expectedNetProfit: netProfit,
    netProfitPct: Number(row.net_profit_pct || 0),
    capitalRequired: Number(row.capital_required),
    capitalSource: (String(row.capital_source || requiredCapitalSource) as Opportunity['capitalSource']),
    status: String(row.status) as Opportunity['status'],
    quoteTimestamp: Number(row.quote_timestamp || 0),
    expiresAt: new Date(String(row.expires_at)).getTime(),
    confidence: Number(row.confidence || 0),
  };
}

// The existing worker control/execution flow remains unchanged below this point.
// Mixed CEX/DEX and DEX/DEX opportunities must pass validateCoordinatedOpportunity
// before any future execution-release coordinator is permitted to submit a leg.
