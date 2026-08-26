import type { FundedSigner, SignerKind } from '../index';

function parseKind(ref: string): SignerKind {
  if (ref.startsWith('vault://')) return 'VAULT';
  if (ref.startsWith('hsm://')) return 'HSM';
  if (ref.startsWith('kms://')) return 'KMS';
  if (ref.startsWith('keystore://')) return 'PROTECTED_KEYSTORE';
  throw new Error('SIGNER_INVALID_REF');
}

function endpoint(): string {
  const value = process.env.SIGNER_PROVIDER_URL?.trim();
  if (!value) throw new Error('SIGNER_PROVIDER_NOT_CONFIGURED');
  return value.replace(/\/$/, '');
}

function token(): string {
  const value = process.env.SIGNER_PROVIDER_TOKEN?.trim();
  if (!value) throw new Error('SIGNER_PROVIDER_TOKEN_NOT_CONFIGURED');
  return value;
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${endpoint()}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`SIGNER_PROVIDER_HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

export function createHttpProtectedSigner(ref = process.env.TRADING_SIGNER_REF): FundedSigner {
  if (!ref) throw new Error('SIGNER_NOT_CONFIGURED');
  const kind = parseKind(ref);
  return {
    ref,
    kind,
    async address(network) {
      const result = await request<{ address: string }>('/v1/address', { ref, network });
      if (!result.address) throw new Error('SIGNER_ADDRESS_UNAVAILABLE');
      return result.address;
    },
    async balance(network, asset) {
      const result = await request<{ balance: number }>('/v1/balance', { ref, network, asset });
      if (!Number.isFinite(result.balance) || result.balance < 0) throw new Error('SIGNER_BALANCE_INVALID');
      return result.balance;
    },
    async sign(network, payload) {
      const result = await request<{ signature: string }>('/v1/sign', { ref, network, payload });
      if (!result.signature) throw new Error('SIGNER_SIGNATURE_UNAVAILABLE');
      return result.signature;
    },
  };
}
