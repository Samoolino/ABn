import type { Opportunity } from '@abn/types';
import type { DexGatewayClient, DexExecutableQuote } from './dex-gateway';

export interface DexExecutionRequest {
  opportunity: Opportunity;
  connector: string;
  network: string;
  walletAddress?: string;
  clientOrderId: string;
  minNetProfit: number;
  maxSlippagePct: number;
  maxConfirmMs: number;
}

export interface DexExecutionResult {
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  txHash?: string;
  actualAmountOut?: string;
  quote: DexExecutableQuote;
}

export async function executeDexOpportunity(
  gateway: DexGatewayClient,
  request: DexExecutionRequest,
): Promise<DexExecutionResult> {
  if (!Number.isFinite(request.opportunity.expectedNetProfit) || request.opportunity.expectedNetProfit <= request.minNetProfit) {
    throw new Error('DEX_NET_PROFIT_SAFETY_GATE_REJECTED');
  }
  if (!Number.isFinite(request.opportunity.quantity) || request.opportunity.quantity <= 0) {
    throw new Error('DEX_QUANTITY_INVALID');
  }
  if (!Number.isFinite(request.maxSlippagePct) || request.maxSlippagePct <= 0) {
    throw new Error('DEX_SLIPPAGE_POLICY_INVALID');
  }

  const quote = await gateway.quote({
    connector: request.connector,
    network: request.network,
    tradingPair: request.opportunity.symbol,
    side: 'BUY',
    amount: String(request.opportunity.quantity),
    slippagePct: request.maxSlippagePct,
  });

  if (!quote.amountIn || !quote.amountOut) throw new Error('DEX_QUOTE_NOT_EXECUTABLE');

  const swap = await gateway.executeSwap({
    connector: request.connector,
    network: request.network,
    tradingPair: request.opportunity.symbol,
    side: 'BUY',
    amount: String(request.opportunity.quantity),
    slippagePct: request.maxSlippagePct,
    walletAddress: request.walletAddress,
    clientOrderId: request.clientOrderId,
  });

  const deadline = Date.now() + request.maxConfirmMs;
  while (Date.now() < deadline) {
    const status = await gateway.transactionStatus({ txHash: swap.txHash });
    if (status.status === 'CONFIRMED') {
      return { status: 'COMPLETED', txHash: swap.txHash, actualAmountOut: status.actualAmountOut, quote };
    }
    if (status.status === 'FAILED') {
      return { status: 'FAILED', txHash: swap.txHash, quote };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { status: 'TIMEOUT', txHash: swap.txHash, quote };
}
