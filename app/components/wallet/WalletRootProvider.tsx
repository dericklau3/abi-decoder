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
    [mainnet.id]: http(),
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [avalanche.id]: http(),
    [sepolia.id]: http(),
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
