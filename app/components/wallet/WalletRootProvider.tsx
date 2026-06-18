"use client";

import "./wallet-console-guard";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { http, WagmiProvider } from "wagmi";
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
import { WalletProvider } from "./WalletProvider";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const wallets = walletConnectProjectId
  ? [injectedWallet, walletConnectWallet]
  : [injectedWallet];
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

const config = getDefaultConfig({
  appName: "EVM Toolkit",
  projectId: walletConnectProjectId ?? "injected-wallets-only",
  wallets: [
    {
      groupName: "钱包",
      wallets,
    },
  ],
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
  },
  ssr: true,
});

export default function WalletRootProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletProvider>{children}</WalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
