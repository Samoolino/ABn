export type SignerKind = 'VAULT' | 'HSM' | 'KMS' | 'PROTECTED_KEYSTORE';

export interface FundedSigner {
  readonly ref: string;
  readonly kind: SignerKind;
  address(network: string): Promise<string>;
  balance(network: string, asset: string): Promise<number>;
  sign(network: string, payload: string): Promise<string>;
}

export function signerRefConfigured(ref = process.env.TRADING_SIGNER_REF): boolean {
  return Boolean(ref && /^(vault|hsm|kms|keystore):\/\//.test(ref));
}

export function assertFundedCapital(availableUsd: number, requiredUsd: number, reserveUsd: number): void {
  if (!Number.isFinite(availableUsd) || availableUsd < requiredUsd + reserveUsd) {
    throw new Error(`INSUFFICIENT_FUNDED_CAPITAL:available=${availableUsd}:required=${requiredUsd}:reserve=${reserveUsd}`);
  }
}

/**
 * Deliberately does not parse or retain a raw private key. Concrete Vault/HSM/KMS
 * implementations resolve signing material only inside the protected signer boundary.
 */
export function requireProtectedSigner(ref = process.env.TRADING_SIGNER_REF): string {
  if (!signerRefConfigured(ref)) throw new Error('SIGNER_NOT_CONFIGURED');
  return ref!;
}
