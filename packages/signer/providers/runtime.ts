import type { FundedSigner, SignerKind } from '../index.js';
import { createHttpProtectedSigner } from './http-protected.js';

export type ProtectedSignerImplementation = (
  ref: string,
  kind: SignerKind,
) => Promise<FundedSigner>;

/**
 * Loads a deployment-supplied protected signer provider.
 *
 * Preferred production mode is an externally hosted Vault/HSM/KMS/protected
 * keystore signer service. The service receives the signer reference and
 * performs all key handling outside this application.
 */
export async function loadProtectedSignerImplementation(): Promise<ProtectedSignerImplementation> {
  const moduleRef = process.env.SIGNER_PROVIDER_MODULE?.trim();
  if (moduleRef) {
    const loaded = await import(moduleRef);
    const resolve = loaded.resolve ?? loaded.default?.resolve;
    if (typeof resolve !== 'function') throw new Error('SIGNER_PROVIDER_INVALID');
    return resolve as ProtectedSignerImplementation;
  }

  if (process.env.SIGNER_PROVIDER_URL?.trim()) {
    return async (ref: string) => createHttpProtectedSigner(ref);
  }

  throw new Error('SIGNER_PROVIDER_NOT_CONFIGURED');
}
