"use client";

import "./wallet-console-guard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { walletConnect } from "wagmi/connectors/walletConnect";
import {
  arbitrum,
  avalanche,
  base,
  bsc,
  bscTestnet,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from "wagmi/chains";
import { arcTestnet, robinhoodTestnet } from "./chains";
import { WalletProvider } from "./WalletProvider";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const walletConnectConnector = walletConnectProjectId
  ? walletConnect({ projectId: walletConnectProjectId })
  : null;
const connectors = walletConnectConnector
  ? [injected(), (config: Parameters<typeof walletConnectConnector>[0]) => {
      const connector = walletConnectConnector(config);
      return {
        ...connector,
        // WalletConnect setup opens IndexedDB, which is only available in the browser.
        setup: typeof window === "undefined" ? undefined : connector.setup,
      };
    }]
  : [injected()];
const RPC_URLS = {
  mainnet: "https://ethereum-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  bscTestnet: "https://bsc-testnet-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  optimism: "https://optimism-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  avalanche: "https://avalanche-c-chain-rpc.publicnode.com",
  sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
} as const;

const config = createConfig({
  connectors,
  chains: [
    mainnet,
    bsc,
    bscTestnet,
    polygon,
    base,
    optimism,
    arbitrum,
    avalanche,
    sepolia,
    robinhoodTestnet,
    arcTestnet,
  ],
  transports: {
    [mainnet.id]: http(RPC_URLS.mainnet),
    [bsc.id]: http(RPC_URLS.bsc),
    [bscTestnet.id]: http(RPC_URLS.bscTestnet),
    [polygon.id]: http(RPC_URLS.polygon),
    [base.id]: http(RPC_URLS.base),
    [optimism.id]: http(RPC_URLS.optimism),
    [arbitrum.id]: http(RPC_URLS.arbitrum),
    [avalanche.id]: http(RPC_URLS.avalanche),
    [sepolia.id]: http(RPC_URLS.sepolia),
    [robinhoodTestnet.id]: http(),
    [arcTestnet.id]: http(),
  },
  ssr: true,
});

export default function WalletRootProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>{children}</WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
