"use client";

import { BrowserProvider } from "ethers";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type InjectedProvider = {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: InjectedProvider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isOkxWallet?: boolean;
  isOKXWallet?: boolean;
  isOKExWallet?: boolean;
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
  hasDiscoveredOkx: boolean;
  hasDiscoveredMetaMask: boolean;
  okxInstalled: boolean;
  metaMaskInstalled: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWallet: (injectedOverride?: InjectedProvider | null) => Promise<void>;
  disconnectWallet: () => void;
  getOkxProvider: () => InjectedProvider | null;
  getMetaMaskProvider: () => InjectedProvider | null;
};

declare global {
  interface Window {
    ethereum?: {
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
      request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
      providers?: unknown[];
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
    };
    okxwallet?: {
      ethereum?: {
        on?: (event: string, handler: (...args: any[]) => void) => void;
        removeListener?: (event: string, handler: (...args: any[]) => void) => void;
        request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
        isOkxWallet?: boolean;
      };
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
      request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
      isOkxWallet?: boolean;
    };
  }
}

const WalletContext = createContext<WalletContextValue | null>(null);

const uniqProviders = (items: Array<InjectedProvider | null | undefined>) => {
  const seen = new Set<InjectedProvider>();
  const result: InjectedProvider[] = [];
  items.forEach((item) => {
    if (!item || seen.has(item)) {
      return;
    }
    seen.add(item);
    result.push(item);
  });
  return result;
};

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

  const getInjectedProviders = () => {
    if (typeof window === "undefined") {
      return [];
    }
    const ethereum = window.ethereum as unknown as InjectedProvider | undefined;
    const ethereumProviders = Array.isArray(ethereum?.providers)
      ? ethereum?.providers
      : [];
    return uniqProviders([
      ...ethereumProviders,
      window.okxwallet as unknown as InjectedProvider | undefined,
      window.okxwallet?.ethereum as unknown as InjectedProvider | undefined,
      ethereum,
    ]).filter((item) => typeof item.request === "function");
  };

  const getOkxProvider = () => {
    if (typeof window === "undefined") {
      return null;
    }
    if (window.okxwallet?.request) {
      return window.okxwallet;
    }
    if (window.okxwallet?.ethereum?.request) {
      return window.okxwallet.ethereum;
    }
    const candidates = getInjectedProviders();
    return (
      candidates.find(
        (candidate) =>
          candidate.isOkxWallet ||
          candidate.isOKXWallet ||
          candidate.isOKExWallet,
      ) ?? null
    );
  };

  const getMetaMaskProvider = () => {
    if (typeof window === "undefined") {
      return null;
    }
    const candidates = getInjectedProviders();
    const okx = getOkxProvider();
    return (
      candidates.find((candidate) => {
        if (!candidate.isMetaMask) {
          return false;
        }
        if (candidate.isBraveWallet) {
          return false;
        }
        if (candidate.isCoinbaseWallet) {
          return false;
        }
        if (candidate.isOkxWallet || candidate.isOKXWallet || candidate.isOKExWallet) {
          return false;
        }
        if (okx && candidate === okx) {
          return false;
        }
        return true;
      }) ?? null
    );
  };

  const getDefaultProvider = () =>
    getMetaMaskProvider() ??
    getOkxProvider() ??
    (window.ethereum as unknown as InjectedProvider | undefined) ??
    (window.okxwallet as unknown as InjectedProvider | undefined);

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
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handler as EventListener,
      );
    };
  }, []);

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

  const connectWallet = async (injectedOverride?: InjectedProvider | null) => {
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
  };

  const disconnectWallet = () => {
    setProvider(null);
    setAccount("");
    setNetworkName("");
    setChainId(null);
    setInjected(null);
    setWalletError("");
    setIsWalletModalOpen(false);
  };

  const sortedEip6963Providers = useMemo(() => {
    return [...eip6963Providers].sort((a, b) =>
      (a.info.name || "").localeCompare(b.info.name || ""),
    );
  }, [eip6963Providers]);

  const discoveredRdnsSet = useMemo(() => {
    return new Set(
      sortedEip6963Providers
        .map((item) => (item.info.rdns || "").toLowerCase())
        .filter(Boolean),
    );
  }, [sortedEip6963Providers]);

  const hasDiscoveredOkx = useMemo(() => {
    if (sortedEip6963Providers.some((item) => /okx/i.test(item.info.name || ""))) {
      return true;
    }
    for (const rdns of discoveredRdnsSet) {
      if (rdns.includes("okx")) {
        return true;
      }
    }
    return false;
  }, [sortedEip6963Providers, discoveredRdnsSet]);

  const hasDiscoveredMetaMask = useMemo(() => {
    if (
      sortedEip6963Providers.some((item) => /metamask/i.test(item.info.name || ""))
    ) {
      return true;
    }
    for (const rdns of discoveredRdnsSet) {
      if (rdns.includes("metamask")) {
        return true;
      }
    }
    return false;
  }, [sortedEip6963Providers, discoveredRdnsSet]);

  const okxInstalled = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(getOkxProvider());
  }, []);

  const metaMaskInstalled = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (!hasDiscoveredMetaMask && window.okxwallet) {
      return false;
    }
    return Boolean(getMetaMaskProvider());
  }, [hasDiscoveredMetaMask]);

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
      hasDiscoveredOkx,
      hasDiscoveredMetaMask,
      okxInstalled,
      metaMaskInstalled,
      openWalletModal: () => setIsWalletModalOpen(true),
      closeWalletModal: () => setIsWalletModalOpen(false),
      connectWallet,
      disconnectWallet,
      getOkxProvider,
      getMetaMaskProvider,
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
      hasDiscoveredOkx,
      hasDiscoveredMetaMask,
      okxInstalled,
      metaMaskInstalled,
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
