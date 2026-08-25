import type { ExecutionConnector, ExecutionPlan, LegResult } from './index';

/** Deterministic execution connector used only when TRADING_MODE=DRY_RUN. */
export class DryRunExecutionConnector implements ExecutionConnector {
  async executeBuy(plan: ExecutionPlan): Promise<LegResult> {
    return this.fill(plan, 'buy');
  }

  async executeSell(plan: ExecutionPlan): Promise<LegResult> {
    return this.fill(plan, 'sell');
  }

  async hedgeOrExit(plan: ExecutionPlan, leg: LegResult): Promise<LegResult> {
    return {
      status: 'FULL_FILL',
      filled: leg.filled,
      average: leg.average,
      externalId: `dry-hedge-${plan.correlationId}`,
    };
  }

  private fill(plan: ExecutionPlan, side: 'buy' | 'sell'): LegResult {
    const leg = side === 'buy' ? plan.buy : plan.sell;
    const filled = Number(leg.quantity ?? leg.amount ?? 0);
    const average = Number(leg.price ?? leg.averagePrice ?? 0);
    return {
      status: filled > 0 && average > 0 ? 'FULL_FILL' : 'REJECTED',
      filled,
      average: average > 0 ? average : undefined,
      externalId: `dry-${side}-${plan.correlationId}`,
    };
  }
}
