import { BrowserProvider, type Eip1193Provider } from "ethers";

type ChainMetadata = { id: number; name: string; nativeCurrency: { symbol: string } };

export function getWalletNetwork(chainId: number, chain?: ChainMetadata) {
  const known = chain?.id === chainId ? chain : undefined;
  return {
    chainId,
    name: known?.name ?? `Chain #${chainId}`,
    symbol: known?.nativeCurrency.symbol ?? "原生币",
  };
}

export function createWalletProvider(transport: Eip1193Provider, network: ReturnType<typeof getWalletNetwork>) {
  return new BrowserProvider(transport, { chainId: network.chainId, name: network.name });
}
