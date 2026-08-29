import type { Opportunity } from '@abn/types';

export type ExecutionLegKind = 'CEX' | 'DEX';

export interface ExecutionLeg {
  kind: ExecutionLegKind;
  side: 'BUY' | 'SELL';
  venue: string;
  network?: string;
  symbol: string;
  quantity: number;
}

export interface CoordinatedExecutionPlan {
  opportunityId: string;
  correlationId: string;
  legs: [ExecutionLeg, ExecutionLeg];
  maxUnhedgedMs: number;
}

/**
 * Produces a two-leg execution plan only. It does not submit orders.
 * Mixed CEX/DEX and DEX/DEX routes must be validated by the caller before
 * either leg is released, preventing a single-leg arbitrage submission.
 */
export function createCoordinatedExecutionPlan(
  opportunity: Opportunity,
  input: {
    correlationId: string;
    maxUnhedgedMs: number;
    isCexVenue: (venue: string) => boolean;
  },
): CoordinatedExecutionPlan {
  if (!opportunity.id || !input.correlationId) throw new Error('COORDINATED_EXECUTION_ID_REQUIRED');
  if (!Number.isFinite(opportunity.quantity) || opportunity.quantity <= 0) {
    throw new Error('COORDINATED_EXECUTION_QUANTITY_INVALID');
  }
  if (!Number.isFinite(input.maxUnhedgedMs) || input.maxUnhedgedMs <= 0) {
    throw new Error('COORDINATED_EXECUTION_TIMEOUT_INVALID');
  }

  const buyKind: ExecutionLegKind = input.isCexVenue(opportunity.buyVenue) ? 'CEX' : 'DEX';
  const sellKind: ExecutionLegKind = input.isCexVenue(opportunity.sellVenue) ? 'CEX' : 'DEX';

  return {
    opportunityId: opportunity.id,
    correlationId: input.correlationId,
    maxUnhedgedMs: input.maxUnhedgedMs,
    legs: [
      {
        kind: buyKind,
        side: 'BUY',
        venue: opportunity.buyVenue,
        network: opportunity.buyNetwork,
        symbol: opportunity.symbol,
        quantity: opportunity.quantity,
      },
      {
        kind: sellKind,
        side: 'SELL',
        venue: opportunity.sellVenue,
        network: opportunity.sellNetwork,
        symbol: opportunity.symbol,
        quantity: opportunity.quantity,
      },
    ],
  };
}
