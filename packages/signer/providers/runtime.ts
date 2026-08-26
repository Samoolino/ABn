import type { FundedSigner, SignerKind } from '../index.js';

export type ProtectedSignerImplementation = (
  ref: string,
  kind: SignerKind,
) => Promise<FundedSigner>;

/**
 * Loads a deployment-supplied protected signer provider.
 *
 * The provider module is deliberately outside this repository's secret material.
 * It must export `resolve(ref, kind)` and perform all key handling inside Vault,
 * HSM, KMS, or another protected keystore boundary.
 */
export async function loadProtectedSignerImplementation(): Promise<ProtectedSignerImplementation> {
  const moduleRef = process.env.SIGNER_PROVIDER_MODULE?.trim();
  if (!moduleRef) throw new Error('SIGNER_PROVIDER_NOT_CONFIGURED');

  const loaded = await import(moduleRef);
  const resolve = loaded.resolve ?? loaded.default?.resolve;
  if (typeof resolve !== 'function') throw new Error('SIGNER_PROVIDER_INVALID');

  return resolve as ProtectedSignerImplementation;
}
