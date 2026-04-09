"use client";

import { BrowserProvider } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { shouldRequestWalletDiscovery } from "./wallet-discovery-utils";

export type InjectedProvider = {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type EIP6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  [key: string]: unknown;
};

type EIP6963ProviderDetail = {
  info: EIP6963ProviderInfo;
  provider: InjectedProvider;
};

type EIP6963AnnounceProviderEvent = CustomEvent<EIP6963ProviderDetail>;

type WalletContextValue = {
  provider: BrowserProvider | null;
  injected: InjectedProvider | null;
  account: string;
  networkName: string;
  chainId: number | null;
  isWalletModalOpen: boolean;
  walletError: string;
  isConnecting: boolean;
  sortedEip6963Providers: EIP6963ProviderDetail[];
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWallet: (injectedOverride?: InjectedProvider | null) => Promise<void>;
  disconnectWallet: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const parseChainId = (value?: string | number) => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    if (value.startsWith("0x") || value.startsWith("0X")) {
      const parsed = Number.parseInt(value, 16);
      return Number.isNaN(parsed) ? null : parsed;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [injected, setInjected] = useState<InjectedProvider | null>(null);
  const [account, setAccount] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [eip6963Providers, setEip6963Providers] = useState<EIP6963ProviderDetail[]>([]);
  const [hasRequestedDiscovery, setHasRequestedDiscovery] = useState(false);

  const sortedEip6963Providers = useMemo(() => {
    return [...eip6963Providers].sort((a, b) =>
      (a.info.name || "").localeCompare(b.info.name || ""),
    );
  }, [eip6963Providers]);

  const getDefaultProvider = useCallback(
    () => sortedEip6963Providers[0]?.provider ?? null,
    [sortedEip6963Providers],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as EIP6963AnnounceProviderEvent).detail;
      if (!detail?.info?.uuid || !detail?.provider) {
        return;
      }
      setEip6963Providers((prev) => {
        if (prev.some((item) => item.info.uuid === detail.info.uuid)) {
          return prev;
        }
        return [...prev, detail];
      });
    };

    window.addEventListener("eip6963:announceProvider", handler as EventListener);

    return () => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handler as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !shouldRequestWalletDiscovery({
        isWalletModalOpen,
        hasRequestedDiscovery,
      })
    ) {
      return;
    }

    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setHasRequestedDiscovery(true);
  }, [hasRequestedDiscovery, isWalletModalOpen]);

  useEffect(() => {
    if (!injected?.on) {
      return;
    }

    const handleChainChanged = async (nextChainId?: string) => {
      const parsedId = parseChainId(nextChainId);
      if (parsedId !== null) {
        setChainId(parsedId);
      }
      const nextProvider = new BrowserProvider(injected as any);
      setProvider(nextProvider);
      try {
        const network = await nextProvider.getNetwork();
        setNetworkName(network.name);
        setChainId(Number(network.chainId));
      } catch {
        setNetworkName("");
      }
    };

    const handleAccountsChanged = (accounts: string[]) => {
      const nextAccount = accounts?.[0] ?? "";
      setAccount(nextAccount);
      if (!nextAccount) {
        setProvider(null);
        setNetworkName("");
        setChainId(null);
        setInjected(null);
      }
    };

    injected.on("chainChanged", handleChainChanged);
    injected.on("accountsChanged", handleAccountsChanged);
    injected.on("networkChanged", handleChainChanged);

    return () => {
      injected.removeListener?.("chainChanged", handleChainChanged);
      injected.removeListener?.("accountsChanged", handleAccountsChanged);
      injected.removeListener?.("networkChanged", handleChainChanged);
    };
  }, [injected]);

  const connectWallet = useCallback(async (injectedOverride?: InjectedProvider | null) => {
    setWalletError("");
    const selected = injectedOverride ?? getDefaultProvider();
    if (!selected) {
      setWalletError("未安装钱包插件，请安装或打开钱包");
      return;
    }

    try {
      setIsConnecting(true);
      const nextProvider = new BrowserProvider(selected as any);
      await nextProvider.send("eth_requestAccounts", []);
      const signer = await nextProvider.getSigner();
      const nextAccount = await signer.getAddress();
      const network = await nextProvider.getNetwork();
      setProvider(nextProvider);
      setAccount(nextAccount);
      setNetworkName(network.name);
      setChainId(Number(network.chainId));
      setInjected(selected);
      setIsWalletModalOpen(false);
    } catch {
      setWalletError("钱包连接失败，请检查授权");
    } finally {
      setIsConnecting(false);
    }
  }, [getDefaultProvider]);

  const disconnectWallet = useCallback(() => {
    setProvider(null);
    setAccount("");
    setNetworkName("");
    setChainId(null);
    setInjected(null);
    setWalletError("");
    setIsWalletModalOpen(false);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      provider,
      injected,
      account,
      networkName,
      chainId,
      isWalletModalOpen,
      walletError,
      isConnecting,
      sortedEip6963Providers,
      openWalletModal: () => {
        setWalletError("");
        setHasRequestedDiscovery(false);
        setIsWalletModalOpen(true);
      },
      closeWalletModal: () => setIsWalletModalOpen(false),
      connectWallet,
      disconnectWallet,
    }),
    [
      provider,
      injected,
      account,
      networkName,
      chainId,
      isWalletModalOpen,
      walletError,
      isConnecting,
      sortedEip6963Providers,
      connectWallet,
      disconnectWallet,
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
