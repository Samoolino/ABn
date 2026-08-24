export function normalizeSymbol(base: string, quote: string): string {
  return `${base.toUpperCase()}/${quote.toUpperCase()}`;
}

export function normalizeQuantity(value: number, step: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_QUANTITY');
  if (!Number.isFinite(step) || step <= 0) throw new Error('INVALID_STEP');
  return Math.floor(value / step) * step;
}

export function normalizePrice(value: number, tick: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('INVALID_PRICE');
  if (!Number.isFinite(tick) || tick <= 0) throw new Error('INVALID_TICK');
  return Math.floor(value / tick) * tick;
}
