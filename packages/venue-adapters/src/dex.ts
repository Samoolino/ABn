export type DexVenue = 'uniswap' | 'pancakeswap' | 'sushiswap';

export interface DexQuote { amountIn: bigint; amountOut: bigint; gasEstimate: bigint; route: string[]; timestamp: number; }
export interface DEXAdapter {
  readonly venue: DexVenue;
  connect(rpcUrl: string, chainId: number): Promise<void>;
  health(): Promise<boolean>;
  quoteExactInput(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<DexQuote>;
  gasEstimate(tx: { to: string; data: string; value?: bigint }): Promise<bigint>;
  allowance(token: string, owner: string, spender: string): Promise<bigint>;
  buildSwap(input: { tokenIn: string; tokenOut: string; amountIn: bigint; minAmountOut: bigint; recipient: string; deadline: number }): Promise<{ to: string; data: string; value: bigint }>;
  transactionStatus(txHash: string): Promise<{ status: 'pending' | 'confirmed' | 'failed'; blockNumber?: bigint }>;
  reconcile(txHash: string): Promise<{ status: 'confirmed' | 'failed'; amountIn?: bigint; amountOut?: bigint }>;
}
