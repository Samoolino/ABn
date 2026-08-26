import type { FundedSigner, SignerKind } from '../index.js';

export interface ProtectedSignerResolver {
  resolve(ref: string): Promise<FundedSigner>;
}

function kindFromRef(ref: string): SignerKind {
  const scheme = ref.split('://', 1)[0];
  if (scheme === 'vault') return 'VAULT';
  if (scheme === 'hsm') return 'HSM';
  if (scheme === 'kms') return 'KMS';
  if (scheme === 'keystore') return 'PROTECTED_KEYSTORE';
  throw new Error('UNSUPPORTED_SIGNER_REF');
}

/**
 * Runtime boundary for protected signing providers.
 *
 * This intentionally does not accept a raw private key. A deployment must
 * inject a concrete resolver backed by Vault/HSM/KMS/protected keystore.
 */
export function createProtectedSignerResolver(
  implementation: (ref: string, kind: SignerKind) => Promise<FundedSigner>,
): ProtectedSignerResolver {
  return {
    async resolve(ref: string) {
      if (!ref || !/^(vault|hsm|kms|keystore):\/\//.test(ref)) {
        throw new Error('SIGNER_NOT_CONFIGURED');
      }
      return implementation(ref, kindFromRef(ref));
    },
  };
}
