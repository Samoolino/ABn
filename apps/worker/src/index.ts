import crypto from 'node:crypto';
import { createDatabasePool } from '@abn/database';
import { createRedisClient } from '@abn/redis';
import { fundedCapitalPolicy } from '@abn/capital-engine';
import { signerRefConfigured, loadProtectedSignerImplementation } from '@abn/signer';
import { createCEXAdapterFromEnv, executeHummingbotPair, createHummingbotClient, validateCoordinatedOpportunity } from '@abn/execution';
import type { FundedSigner } from '@abn/signer';
import type { CEXAdapter } from '@abn/venue-adapters';
import type { Opportunity } from '@abn/types';
import { enforceLiveStartupConfiguration } from './live-startup-integration';

const requestedMode = process.env.TRADING_MODE || process.env.RUNTIME_MODE || 'STOPPED';
const interval = Number(process.env.HEARTBEAT_MS || 5000);
const db = createDatabasePool();
const redis = createRedisClient();
const policy = fundedCapitalPolicy();
const safetyReserve = Number(process.env.SAFETY_RESERVE_USD || policy.minReserveUsd);
const executionEnabled = process.env.EXECUTION_ENABLED === 'true';
const signerNetwork = process.env.SIGNER_BALANCE_NETWORK || 'ethereum';
const capitalAsset = process.env.CAPITAL_ASSET || 'USDC';
const capitalAssetUsdRate = Number(process.env.CAPITAL_ASSET_USD_RATE || '1');
const hummingbotBaseUrl = process.env.HUMMINGBOT_BASE_URL;
const hummingbotAccount = process.env.HUMMINGBOT_ACCOUNT || 'master_account';
const hummingbotUsername = process.env.HUMMINGBOT_USERNAME;
const hummingbotPassword = process.env.HUMMINGBOT_PASSWORD;
const hummingbotApiKey = process.env.HUMMINGBOT_API_KEY;
const hummingbotConfigured = Boolean(hummingbotBaseUrl && (hummingbotApiKey || (hummingbotUsername && hummingbotPassword)));

let mode = requestedMode;
let controlStatus = 'STOPPED';
let executing = false;
let fundedSigner: FundedSigner | null = null;
let signerVerification: { address: string; balance: number; usdEquivalent: number } | null = null;

const startup = enforceLiveStartupConfiguration({
  mode: requestedMode,
  executionEnabled,
  signerConfigured: signerRefConfigured(),
  hummingbotConfigured,
});
if (!startup.allowed) {
  mode = startup.mode;
  console.error(JSON.stringify({ event: 'live_startup_blocked', requestedMode, mode, reasons: startup.reasons }));
}

function signerReady() { return signerRefConfigured(); }
function isCexVenue(venue: string) { return ['mexc','gate','binance','kraken','okx','bybit','coinbase','kucoin','bitfinex','lbank'].includes(venue.toLowerCase()); }
function splitSymbol(symbol: string) { const normalized=symbol.trim().toUpperCase().replace('-', '/'); const parts=normalized.split('/'); if(parts.length!==2||!parts[0]||!parts[1]) throw new Error(`SYMBOL_UNSUPPORTED_FOR_BALANCE_GATE:${symbol}`); return {base:parts[0],quote:parts[1]}; }
function balanceOf(balances: Record<string, number>, asset: string) { const key=Object.keys(balances).find(k=>k.toUpperCase()===asset.toUpperCase()); const value=key?Number(balances[key]):0; return Number.isFinite(value)&&value>=0?value:0; }

function createHummingbotExecutionClient() {
  if (!hummingbotBaseUrl) throw new Error('HUMMINGBOT_BASE_URL_REQUIRED');
  if (!hummingbotUsername && !hummingbotApiKey) throw new Error('HUMMINGBOT_AUTH_REQUIRED');
  if (hummingbotUsername && !hummingbotPassword) throw new Error('HUMMINGBOT_PASSWORD_REQUIRED');
  return createHummingbotClient({ baseUrl: hummingbotBaseUrl, username: hummingbotUsername, password: hummingbotPassword, apiKey: hummingbotApiKey, timeoutMs: Number(process.env.HUMMINGBOT_TIMEOUT_MS || 5000) });
}

async function verifyCexInventory(buyAdapter:CEXAdapter,sellAdapter:CEXAdapter,opportunity:Opportunity){ const {base,quote}=splitSymbol(opportunity.symbol); const [buyBalances,sellBalances]=await Promise.all([buyAdapter.balances(),sellAdapter.balances()]); const buyQuoteBalance=balanceOf(buyBalances,quote); const sellBaseBalance=balanceOf(sellBalances,base); const requiredQuote=Number(opportunity.capitalRequired); const requiredBase=Number(opportunity.quantity); if(!Number.isFinite(requiredQuote)||requiredQuote<=0) throw new Error('CEX_BUY_CAPITAL_REQUIRED_INVALID'); if(!Number.isFinite(requiredBase)||requiredBase<=0) throw new Error('CEX_SELL_QUANTITY_INVALID'); if(buyQuoteBalance<requiredQuote+safetyReserve) throw new Error(`INSUFFICIENT_CEX_BUY_QUOTE:${buyAdapter.name}:${quote}:${buyQuoteBalance}:required=${requiredQuote}:reserve=${safetyReserve}`); if(sellBaseBalance<requiredBase) throw new Error(`INSUFFICIENT_CEX_SELL_BASE:${sellAdapter.name}:${base}:${sellBaseBalance}:required=${requiredBase}`); return {buyQuoteBalance,sellBaseBalance,source:'CEX_ACCOUNT_BALANCES'}; }

async function resolveAndVerifySigner(requiredUsd:number){ if(!signerReady()) throw new Error('SIGNER_NOT_CONFIGURED'); if(!Number.isFinite(capitalAssetUsdRate)||capitalAssetUsdRate<=0) throw new Error('CAPITAL_ASSET_USD_RATE_INVALID'); const implementation=await loadProtectedSignerImplementation(); const ref=process.env.TRADING_SIGNER_REF!; const kind=ref.split('://',1)[0]; fundedSigner=await implementation(ref,kind.toUpperCase() as FundedSigner['kind']); const address=await fundedSigner.address(signerNetwork); if(!address) throw new Error('SIGNER_ADDRESS_UNAVAILABLE'); const balance=await fundedSigner.balance(signerNetwork,capitalAsset); const usdEquivalent=balance*capitalAssetUsdRate; if(!Number.isFinite(balance)||balance<0||!Number.isFinite(usdEquivalent)) throw new Error('SIGNER_BALANCE_UNAVAILABLE'); if(usdEquivalent<requiredUsd+safetyReserve) throw new Error(`INSUFFICIENT_FUNDED_WALLET:usd=${usdEquivalent}:required=${requiredUsd}:reserve=${safetyReserve}`); signerVerification={address,balance,usdEquivalent}; return signerVerification; }

function mapOpportunity(row:Record<string,unknown>):Opportunity { const netProfit=Number(row.net_profit??row.expected_net_profit??0); return {id:String(row.id),correlationId:row.correlation_id?String(row.correlation_id):undefined,symbol:String(row.symbol),buyVenue:String(row.buy_venue),sellVenue:String(row.sell_venue),buyNetwork:row.buy_network?String(row.buy_network):undefined,sellNetwork:row.sell_network?String(row.sell_network):undefined,quantity:Number(row.quantity),grossProfit:Number(row.gross_profit||0),tradingFees:Number(row.trading_fees||0),gasCost:Number(row.gas_cost||0),slippageCost:Number(row.slippage_cost||0),bridgeCost:Number(row.bridge_cost||0),settlementCost:Number(row.settlement_cost||0),safetyReserve:Number(row.safety_reserve||safetyReserve),netProfit,expectedNetProfit:netProfit,netProfitPct:Number(row.net_profit_pct||0),capitalRequired:Number(row.capital_required),capitalSource:String(row.capital_source||'FUNDED_INVENTORY') as Opportunity['capitalSource'],status:String(row.status) as Opportunity['status'],quoteTimestamp:Number(row.quote_timestamp||0),expiresAt:new Date(String(row.expires_at)).getTime(),confidence:Number(row.confidence||0)}; }

async function refreshControlAndOpportunity(){ if(!db||executing)return; controlStatus=(await db.query(`select status from system_health where component='trading_control' limit 1`)).rows[0]?.status||'STOPPED'; if(mode==='DRY_RUN'||requestedMode!=='LIVE'||controlStatus!=='ARMED'){if(requestedMode!=='LIVE')mode=requestedMode==='DRY_RUN'?'DRY_RUN':'STOPPED';return;} if(!startup.allowed)return; if(!signerReady()||!hummingbotConfigured){mode='DRY_RUN';return;}
  const candidate=await db.query(`select * from opportunities where status in ('EXECUTABLE','EXECUTABLE_NOW') and expires_at>now() and expected_net_profit>$1 order by expected_net_profit/greatest(capital_required,0.00000001) desc limit 1`,[safetyReserve]);
  const row=candidate.rows[0] as Record<string,unknown>|undefined;if(!row)return; const opportunity=mapOpportunity(row); if(opportunity.capitalSource!=='FUNDED_INVENTORY'||!Number.isFinite(opportunity.capitalRequired)||opportunity.capitalRequired<=0||opportunity.capitalRequired>policy.maxWorkingUsd)return; if(!isCexVenue(opportunity.buyVenue)||!isCexVenue(opportunity.sellVenue))return;
  let buyAdapter:CEXAdapter;let sellAdapter:CEXAdapter; try{buyAdapter=createCEXAdapterFromEnv(opportunity.buyVenue);sellAdapter=createCEXAdapterFromEnv(opportunity.sellVenue);await Promise.all([buyAdapter.connect(),sellAdapter.connect()]);await verifyCexInventory(buyAdapter,sellAdapter,opportunity);await resolveAndVerifySigner(opportunity.capitalRequired);}catch(error){mode='ARMED';console.error(JSON.stringify({event:'capital_or_signer_preflight_rejected',opportunityId:opportunity.id,error:String(error)}));return;}
  if(!executionEnabled)return; executing=true;mode='EXECUTING'; const correlationId=crypto.randomUUID(); try{
    const hummingbot=createHummingbotExecutionClient();
    const result=await executeHummingbotPair(opportunity,{accountName:hummingbotAccount,buy:{connectorName:opportunity.buyVenue,tradingPair:opportunity.symbol.replace('/','-'),amount:opportunity.quantity},sell:{connectorName:opportunity.sellVenue,tradingPair:opportunity.symbol.replace('/','-'),amount:opportunity.quantity}},hummingbot,Number(process.env.HUMMINGBOT_EXECUTION_TIMEOUT_MS || 1500));
    mode=result.status==='COMPLETED'?'ARMED':'EMERGENCY_STOP';
    console.log(JSON.stringify({event:'hummingbot_pair_result',correlationId,opportunityId:opportunity.id,status:result.status,buyOrderId:result.buyOrderId,sellOrderId:result.sellOrderId}));
  }catch(error){mode='EMERGENCY_STOP';console.error(JSON.stringify({event:'execution_error',correlationId,opportunityId:opportunity.id,error:String(error)}));}finally{executing=false;}
}

console.log(JSON.stringify({event:'worker_start',mode,requestedMode,executionEnabled,capitalAsset,signerNetwork,hummingbotConfigured,startupGate:startup}));
setInterval(()=>{void refreshControlAndOpportunity().catch(error=>{mode='EMERGENCY_STOP';console.error(JSON.stringify({event:'execution_gate_error',error:String(error)}));});},Math.max(250,interval));
