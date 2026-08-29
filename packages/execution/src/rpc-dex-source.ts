import { JsonRpcProvider, Contract } from 'ethers';
import type { DexOnChainSource } from './dex-readiness';

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function decimals() view returns (uint8)'];

export function createRpcDexOnChainSource(input: {
  rpcUrlForNetwork: (network: string) => string | undefined;
  ownerForNetwork: (network: string) => string;
  tokenAddressForAsset: (network: string, asset: string) => string | undefined;
}): DexOnChainSource {
  const providers = new Map<string, JsonRpcProvider>();

  function provider(network: string): JsonRpcProvider {
    const existing = providers.get(network);
    if (existing) return existing;
    const url = input.rpcUrlForNetwork(network);
    if (!url) throw new Error('DEX_RPC_URL_REQUIRED');
    const created = new JsonRpcProvider(url);
    providers.set(network, created);
    return created;
  }

  async function token(network: string, asset: string): Promise<{ contract: Contract; decimals: number }> {
    const address = input.tokenAddressForAsset(network, asset);
    if (!address) throw new Error('DEX_TOKEN_ADDRESS_REQUIRED');
    const contract = new Contract(address, ERC20_ABI, provider(network));
    const decimals = Number(await contract.decimals());
    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 255) throw new Error('DEX_TOKEN_DECIMALS_INVALID');
    return { contract, decimals };
  }

  function toNumber(value: bigint, decimals: number): number {
    const divisor = 10 ** decimals;
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || !Number.isFinite(divisor)) throw new Error('DEX_BALANCE_PRECISION_UNSAFE');
    return numeric / divisor;
  }

  return {
    async getBalance({ network, asset }) {
      const owner = input.ownerForNetwork(network);
      if (!owner) throw new Error('DEX_OWNER_REQUIRED');
      const { contract, decimals } = await token(network, asset);
      return toNumber(await contract.balanceOf(owner), decimals);
    },
    async getAllowance({ network, asset, owner, spender }) {
      if (!owner || !spender) throw new Error('DEX_ALLOWANCE_PARTIES_REQUIRED');
      const { contract, decimals } = await token(network, asset);
      return toNumber(await contract.allowance(owner, spender), decimals);
    },
  };
}
