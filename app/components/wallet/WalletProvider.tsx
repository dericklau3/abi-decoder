"use client";

import { BrowserProvider } from "ethers";
import { MulticallProvider } from "@ethers-ext/provider-multicall";
import { createContext, useContext, useMemo, useState } from "react";
import { WalletDialog } from "./WalletDialog";
import { createWalletProvider, getWalletNetwork } from "./wallet-network";
import { useAccount, useConnectorClient, useDisconnect } from "wagmi";

export type InjectedProvider = {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletContextValue = {
  provider: BrowserProvider | null;
  multicallProvider: MulticallProvider | null;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const chainId = account.isConnected ? account.chainId : undefined;
  const network = chainId === undefined ? undefined : getWalletNetwork(chainId, account.chain);
  const { data: connectorClient, isLoading: isConnectorClientLoading } =
    useConnectorClient({ chainId, query: { enabled: account.isConnected && chainId !== undefined } });
  const { disconnect } = useDisconnect();

  const provider = useMemo(() => {
    if (!connectorClient || chainId === undefined) return null;
    // The connector client may have no chain metadata for an unlisted network.
    if (connectorClient.chain && connectorClient.chain.id !== chainId) return null;
    return createWalletProvider(connectorClient.transport, getWalletNetwork(chainId, account.chain));
  }, [connectorClient, chainId, account.chain]);

  const injected = provider
    ? (connectorClient!.transport as InjectedProvider)
    : null;

  const multicallProvider = useMemo(
    () => (provider ? new MulticallProvider(provider) : null),
    [provider],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      provider,
      multicallProvider,
      injected,
      account: account.address ?? "",
      networkName: network?.name ?? "",
      nativeCurrencySymbol: network?.symbol ?? "原生币",
      chainId: chainId ?? null,
      isConnecting: account.isConnecting || account.isReconnecting || isConnectorClientLoading,
      openWalletModal: () => setDialogOpen(true),
      disconnectWallet: () => disconnect(),
    }),
    [
      provider,
      multicallProvider,
      injected,
      account,
      chainId,
      isConnectorClientLoading,
      network?.name,
      network?.symbol,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}<WalletDialog open={dialogOpen} onClose={() => setDialogOpen(false)} /></WalletContext.Provider>;
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
};
