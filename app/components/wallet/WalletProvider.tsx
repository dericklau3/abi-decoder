"use client";

import { BrowserProvider } from "ethers";
import { createContext, useContext, useMemo } from "react";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useConnectorClient, useDisconnect } from "wagmi";

export type InjectedProvider = {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletContextValue = {
  provider: BrowserProvider | null;
  injected: InjectedProvider | null;
  account: string;
  networkName: string;
  nativeCurrencySymbol: string;
  chainId: number | null;
  isConnecting: boolean;
  openWalletModal: () => void;
  disconnectWallet: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const account = useAccount();
  const chainId = useChainId();
  const { data: connectorClient, isLoading: isConnectorClientLoading } =
    useConnectorClient();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const injected = useMemo<InjectedProvider | null>(() => {
    return (connectorClient?.transport as InjectedProvider | undefined) ?? null;
  }, [connectorClient]);

  const provider = useMemo(() => {
    if (!connectorClient) {
      return null;
    }
    return new BrowserProvider(connectorClient.transport as any, {
      chainId: connectorClient.chain.id,
      name: connectorClient.chain.name,
      ensAddress: connectorClient.chain.contracts?.ensRegistry?.address,
    });
  }, [connectorClient]);

  const value = useMemo<WalletContextValue>(
    () => ({
      provider,
      injected,
      account: account.address ?? "",
      networkName: account.chain?.name ?? "",
      nativeCurrencySymbol: account.chain?.nativeCurrency?.symbol ?? "ETH",
      chainId: account.isConnected ? account.chainId ?? chainId ?? null : null,
      isConnecting: account.isConnecting || account.isReconnecting || isConnectorClientLoading,
      openWalletModal: () => {
        if (account.isConnected) {
          openAccountModal?.();
          return;
        }
        openConnectModal?.();
      },
      disconnectWallet: () => disconnect(),
    }),
    [
      provider,
      injected,
      account,
      chainId,
      isConnectorClientLoading,
      openAccountModal,
      openConnectModal,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
};
