"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrowserProvider,
  Contract,
  FunctionFragment,
  getAddress,
  Interface,
  parseEther,
} from "ethers";

declare global {
  interface Window {
    ethereum?: {
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
    okxwallet?: {
      ethereum?: {
        on?: (event: string, handler: (...args: any[]) => void) => void;
        removeListener?: (event: string, handler: (...args: any[]) => void) => void;
        request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
      };
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
      request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

type SavedAbi = { name: string; abi: string };

type FunctionInfo = {
  signature: string;
  name: string;
  stateMutability: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
};

const ABI_LIST_KEY = "abiList";
const CURRENT_ABI_KEY = "currentAbi";

const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const safeJsonParse = <T,>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseAbiJson = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { abi: null as any[] | null, error: "" };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return { abi: null, error: "ABI 需要是数组格式" };
    }
    return { abi: parsed, error: "" };
  } catch (err) {
    return { abi: null, error: "ABI JSON 解析失败" };
  }
};

const parseInputValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const formatResult = (value: unknown) => {
  try {
    return JSON.stringify(
      value,
      (_, item) => (typeof item === "bigint" ? item.toString() : item),
      2,
    );
  } catch {
    return String(value);
  }
};

const getInjectedProvider = () => {
  if (window.okxwallet?.request) {
    return window.okxwallet;
  }
  if (window.okxwallet?.ethereum?.request) {
    return window.okxwallet.ethereum;
  }
  return window.ethereum;
};

const getOkxProvider = () => {
  if (window.okxwallet?.request) {
    return window.okxwallet;
  }
  if (window.okxwallet?.ethereum?.request) {
    return window.okxwallet.ethereum;
  }
  return null;
};

const getProviderCandidates = () =>
  [window.okxwallet, window.okxwallet?.ethereum, window.ethereum].filter(
    Boolean,
  ) as Array<{
    on?: (event: string, handler: (...args: any[]) => void) => void;
    removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    request?: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
  }>;

const CHAIN_NAME_MAP: Record<number, string> = {
  1: "Ethereum",
  5: "Goerli",
  56: "BNB Chain",
  97: "BSC Testnet",
  137: "Polygon",
  42161: "Arbitrum One",
  10: "Optimism",
  8453: "Base",
  11155111: "Sepolia",
};

const COMMON_ADDRESSES = [
  {
    label: "零地址",
    value: "0x0000000000000000000000000000000000000000",
  },
  {
    label: "黑洞地址",
    value: "0x000000000000000000000000000000000000dEaD",
  },
];

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

const getChainLabel = (name: string, chainId: number | null) => {
  if (chainId === null) {
    return name;
  }
  const mapped = CHAIN_NAME_MAP[chainId];
  if (mapped) {
    return mapped;
  }
  if (name && name !== "unknown") {
    return name;
  }
  return `Chain ${chainId}`;
};

const ContractInteractor = () => {
  const [addressInput, setAddressInput] = useState("");
  const [abiInput, setAbiInput] = useState("");
  const [savedAbis, setSavedAbis] = useState<Array<SavedAbi>>([]);
  const [selectedAbiIndex, setSelectedAbiIndex] = useState<number | null>(null);
  const [selectedSignature, setSelectedSignature] = useState("");
  const [argInputs, setArgInputs] = useState<Record<string, string[]>>({});
  const [payableValue, setPayableValue] = useState("");
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [resultOutput, setResultOutput] = useState("");
  const [txHash, setTxHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    const savedAbiList = safeJsonParse<Array<SavedAbi>>(
      localStorage.getItem(ABI_LIST_KEY) || "[]",
      [],
    );
    const currentAbi = localStorage.getItem(CURRENT_ABI_KEY) || "";
    setSavedAbis(savedAbiList);
    setAbiInput(currentAbi);
    if (currentAbi) {
      const idx = savedAbiList.findIndex((item) => item.abi === currentAbi);
      setSelectedAbiIndex(idx >= 0 ? idx : null);
    }
  }, []);

  useEffect(() => {
    const providers = getProviderCandidates();
    const injected = getInjectedProvider();
    if (!injected?.on || providers.length === 0) {
      return;
    }

    const handleChainChanged = (nextChainId?: string) => {
      const parsedId = parseChainId(nextChainId);
      if (parsedId !== null) {
        setChainId(parsedId);
        setNetworkName(getChainLabel("", parsedId));
      }
      const nextProvider = new BrowserProvider(injected as any);
      setProvider(nextProvider);
      nextProvider
        .getNetwork()
        .then((network) => {
          setNetworkName(network.name);
          setChainId(Number(network.chainId));
        })
        .catch(() => {
          setNetworkName("");
        });
    };

    const handleAccountsChanged = (accounts: string[]) => {
      const nextAccount = accounts?.[0] ?? "";
      setAccount(nextAccount);
      if (!nextAccount) {
        setProvider(null);
        setNetworkName("");
        setChainId(null);
      }
    };

    providers.forEach((candidate) => {
      candidate.on?.("chainChanged", handleChainChanged);
      candidate.on?.("accountsChanged", handleAccountsChanged);
      candidate.on?.("networkChanged", handleChainChanged);
    });

    return () => {
      providers.forEach((candidate) => {
        candidate.removeListener?.("chainChanged", handleChainChanged);
        candidate.removeListener?.("accountsChanged", handleAccountsChanged);
        candidate.removeListener?.("networkChanged", handleChainChanged);
      });
    };
  }, []);

  useEffect(() => {
    if (!provider) {
      return;
    }
    provider
      .getNetwork()
      .then((network) => {
        setNetworkName(network.name);
        setChainId(Number(network.chainId));
      })
      .catch(() => {
        setNetworkName("");
        setChainId(null);
      });
  }, [provider]);

  useEffect(() => {
    if (!copyMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopyMessage("");
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (!provider || !account) {
      return;
    }
    const providers = getProviderCandidates();
    if (providers.length === 0) {
      return;
    }
    let isActive = true;
    const refreshNetwork = async () => {
      try {
        for (const candidate of providers) {
          if (!candidate.request) {
            continue;
          }
          const chainHex = (await candidate.request({
            method: "eth_chainId",
          })) as string;
          const parsedId = parseChainId(chainHex);
          if (!isActive) {
            return;
          }
          if (parsedId !== null) {
            setChainId(parsedId);
            setNetworkName(getChainLabel("", parsedId));
            return;
          }
        }
      } catch {
        if (!isActive) {
          return;
        }
        setChainId(null);
      }
    };
    refreshNetwork();
    const timer = window.setInterval(refreshNetwork, 2000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [provider, account]);

  const { abi, error: abiError } = useMemo(
    () => parseAbiJson(abiInput),
    [abiInput],
  );

  const functions = useMemo<FunctionInfo[]>(() => {
    if (!abi) {
      return [];
    }
    try {
      const iface = new Interface(abi);
      return iface.fragments
        .filter((fragment) => fragment.type === "function")
        .map((fragment) => {
          const fn = fragment as FunctionFragment;
          return {
            signature: fn.format(),
            name: fn.name,
            stateMutability: fn.stateMutability ?? "nonpayable",
            inputs: fn.inputs.map((input) => ({
              name: input.name,
              type: input.type,
            })),
            outputs:
              fn.outputs?.map((output) => ({
                name: output.name,
                type: output.type,
              })) ?? [],
          };
        });
    } catch {
      return [];
    }
  }, [abi]);

  const { readFunctions, writeFunctions } = useMemo(() => {
    const read: FunctionInfo[] = [];
    const write: FunctionInfo[] = [];
    functions.forEach((fn) => {
      if (fn.stateMutability === "view" || fn.stateMutability === "pure") {
        read.push(fn);
      } else {
        write.push(fn);
      }
    });
    return { readFunctions: read, writeFunctions: write };
  }, [functions]);

  const selectedFunction = useMemo(
    () => functions.find((item) => item.signature === selectedSignature) ?? null,
    [functions, selectedSignature],
  );

  const handleSelectAbi = (indexValue: string) => {
    if (!indexValue) {
      setSelectedAbiIndex(null);
      setAbiInput("");
      localStorage.removeItem(CURRENT_ABI_KEY);
      return;
    }
    const index = Number(indexValue);
    const selected = savedAbis[index];
    if (!selected) {
      return;
    }
    setSelectedAbiIndex(index);
    setAbiInput(selected.abi);
    localStorage.setItem(CURRENT_ABI_KEY, selected.abi);
  };

  const handleConnect = async (
    injectedOverride?: ReturnType<typeof getInjectedProvider>,
  ) => {
    setErrorMessage("");
    setResultOutput("");
    setTxHash("");
    const injected = injectedOverride ?? getInjectedProvider();
    if (!injected) {
      setErrorMessage("未检测到钱包插件，请安装或打开钱包");
      return;
    }
    try {
      const nextProvider = new BrowserProvider(injected as any);
      await nextProvider.send("eth_requestAccounts", []);
      const signer = await nextProvider.getSigner();
      const nextAccount = await signer.getAddress();
      const network = await nextProvider.getNetwork();
      setProvider(nextProvider);
      setAccount(nextAccount);
      setNetworkName(network.name);
      setChainId(Number(network.chainId));
      setIsWalletModalOpen(false);
    } catch (err) {
      setErrorMessage("钱包连接失败，请检查授权");
    }
  };

  const resetOutputs = () => {
    setErrorMessage("");
    setResultOutput("");
    setTxHash("");
    setIsLoading(false);
  };

  const handleSelectFunction = (signature: string) => {
    setSelectedSignature(signature);
    setPayableValue("");
    resetOutputs();
  };

  const handleCopyAccount = async () => {
    if (!account) {
      setCopyMessage("暂无可复制地址");
      return;
    }
    try {
      await navigator.clipboard.writeText(account);
      setCopyMessage("钱包地址已复制");
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  const handleCopyAddress = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label}已复制`);
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  const ensureInputs = () => {
    if (!selectedFunction) {
      return false;
    }
    const currentInputs = argInputs[selectedFunction.signature] ?? [];
    const missing = selectedFunction.inputs.some(
      (_, index) => !(currentInputs[index] ?? "").trim(),
    );
    if (missing) {
      setErrorMessage("请填写所有参数");
      return false;
    }
    return true;
  };

  const handleCall = async () => {
    resetOutputs();
    if (!provider) {
      setErrorMessage("请先连接钱包");
      return;
    }
    if (!selectedFunction) {
      setErrorMessage("请选择要调用的函数");
      return;
    }
    if (!ensureInputs()) {
      return;
    }
    const normalizedAddress = normalizeAddressInput(addressInput);
    if (!normalizedAddress) {
      setErrorMessage("请输入合约地址");
      return;
    }
    if (!abi) {
      setErrorMessage("请选择 ABI");
      return;
    }
    try {
      setIsLoading(true);
      const checksummed = getAddress(normalizedAddress);
      const contract = new Contract(checksummed, abi, provider);
      const currentInputs = argInputs[selectedFunction.signature] ?? [];
      const args = selectedFunction.inputs.map((_, index) =>
        parseInputValue(currentInputs[index] ?? ""),
      );
      const fn = contract.getFunction(selectedFunction.signature);
      const result = await fn(...args);
      setResultOutput(formatResult(result));
    } catch (err) {
      setErrorMessage("调用失败：" + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    resetOutputs();
    if (!provider) {
      setErrorMessage("请先连接钱包");
      return;
    }
    if (!selectedFunction) {
      setErrorMessage("请选择要调用的函数");
      return;
    }
    if (!ensureInputs()) {
      return;
    }
    const normalizedAddress = normalizeAddressInput(addressInput);
    if (!normalizedAddress) {
      setErrorMessage("请输入合约地址");
      return;
    }
    if (!abi) {
      setErrorMessage("请选择 ABI");
      return;
    }
    try {
      setIsLoading(true);
      const signer = await provider.getSigner();
      const checksummed = getAddress(normalizedAddress);
      const contract = new Contract(checksummed, abi, signer);
      const currentInputs = argInputs[selectedFunction.signature] ?? [];
      const args = selectedFunction.inputs.map((_, index) =>
        parseInputValue(currentInputs[index] ?? ""),
      );
      const fn = contract.getFunction(selectedFunction.signature);
      const overrides =
        selectedFunction.stateMutability === "payable" && payableValue.trim()
          ? { value: parseEther(payableValue.trim()) }
          : {};
      const tx = await fn(...args, overrides);
      setTxHash(tx.hash);
      setResultOutput("");
    } catch (err) {
      setErrorMessage("交易发送失败：" + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          合约交互
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          输入合约地址与 ABI，连接钱包后读取与调用合约函数。
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="text-slate-400">常用地址</span>
          {COMMON_ADDRESSES.map((item) => (
            <button
              key={item.value}
              type="button"
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
              onClick={() => handleCopyAddress(item.value, item.label)}
            >
              <span>{item.label}</span>
              <span className="font-normal text-slate-400">
                {item.value.slice(0, 6)}...{item.value.slice(-4)}
              </span>
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                />
                <rect x="8" y="2" width="8" height="4" rx="1" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="fade-up-delay space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">基础信息</h2>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
              onClick={() => {
                if (!account) {
                  setIsWalletModalOpen(true);
                }
              }}
            >
              {account ? "已连接" : "连接钱包"}
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                合约地址
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="0x..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                当前钱包
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {account || "未连接"}
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={handleCopyAccount}
                  disabled={!account}
                  aria-label="复制钱包地址"
                  title="复制"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                    />
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                当前链
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {networkName || chainId !== null
                  ? `${getChainLabel(networkName, chainId)}${
                      chainId !== null ? ` (#${chainId})` : ""
                    }`
                  : "未连接"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">选择已保存 ABI</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              {savedAbis.length} 个
            </span>
          </div>
          {savedAbis.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              暂无 ABI，请先前往 ABI 管理页面添加。
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  ABI 列表
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={selectedAbiIndex === null ? "" : String(selectedAbiIndex)}
                  onChange={(e) => handleSelectAbi(e.target.value)}
                >
                  <option value="">请选择 ABI</option>
                  {savedAbis.map((item, index) => (
                    <option key={`${item.name}-${index}`} value={index}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  当前 ABI
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {selectedAbiIndex === null
                    ? "未选择"
                    : savedAbis[selectedAbiIndex]?.name}
                </div>
              </div>
            </div>
          )}
          {abiError && (
            <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {abiError}
            </div>
          )}
        </section>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">函数列表</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            {functions.length} 个函数
          </span>
        </div>
        {functions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            请先选择 ABI
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Read Contract
                </h3>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                  {readFunctions.length} 个
                </span>
              </div>
              {readFunctions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  无只读函数
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {readFunctions.map((item) => {
                    const isActive = item.signature === selectedSignature;
                    return (
                      <div key={item.signature} className="space-y-3">
                        <button
                          type="button"
                          className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                            isActive
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                          onClick={() => handleSelectFunction(item.signature)}
                        >
                          <div className="font-medium">{item.name}</div>
                          <div
                            className={`text-xs ${
                              isActive ? "text-slate-200" : "text-slate-500"
                            }`}
                          >
                            {item.signature}
                          </div>
                        </button>
                        {isActive && selectedFunction && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="grid gap-3 md:grid-cols-2">
                              {selectedFunction.inputs.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 md:col-span-2">
                                  此函数无输入参数
                                </div>
                              )}
                              {selectedFunction.inputs.map((input, index) => (
                                <div key={`${input.name || "arg"}-${index}`}>
                                  <label className="mb-2 block text-sm font-medium text-slate-700">
                                    {input.name || `参数 ${index + 1}`}{" "}
                                    <span className="text-xs text-slate-400">
                                      {input.type}
                                    </span>
                                  </label>
                                  <input
                                    type="text"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                                    value={
                                      (argInputs[selectedFunction.signature] ??
                                        [])[index] ?? ""
                                    }
                                    onChange={(e) => {
                                      setArgInputs((prev) => {
                                        const next = {
                                          ...prev,
                                          [selectedFunction.signature]: [
                                            ...(prev[selectedFunction.signature] ??
                                              []),
                                          ],
                                        };
                                        next[selectedFunction.signature][index] =
                                          e.target.value;
                                        return next;
                                      });
                                    }}
                                    placeholder="请输入参数值"
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                type="button"
                                className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                onClick={handleCall}
                                disabled={isLoading}
                              >
                                {isLoading ? "读取中..." : "读取合约"}
                              </button>
                            </div>

                            {errorMessage && (
                              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                {errorMessage}
                              </div>
                            )}

                            {(txHash || resultOutput) && (
                              <div className="mt-4 grid gap-4">
                                {txHash && (
                                  <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">
                                      交易哈希
                                    </label>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                      {txHash}
                                    </div>
                                  </div>
                                )}
                                {resultOutput && (
                                  <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">
                                      输出结果
                                    </label>
                                    <textarea
                                      readOnly
                                      className="min-h-[120px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                      value={resultOutput}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Write Contract
                </h3>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                  {writeFunctions.length} 个
                </span>
              </div>
              {writeFunctions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  无写入函数
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {writeFunctions.map((item) => {
                    const isActive = item.signature === selectedSignature;
                    return (
                      <div key={item.signature} className="space-y-3">
                        <button
                          type="button"
                          className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                            isActive
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                          onClick={() => handleSelectFunction(item.signature)}
                        >
                          <div className="font-medium">{item.name}</div>
                          <div
                            className={`text-xs ${
                              isActive ? "text-slate-200" : "text-slate-500"
                            }`}
                          >
                            {item.signature}
                          </div>
                        </button>
                        {isActive && selectedFunction && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="grid gap-3 md:grid-cols-2">
                              {selectedFunction.inputs.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 md:col-span-2">
                                  此函数无输入参数
                                </div>
                              )}
                              {selectedFunction.inputs.map((input, index) => (
                                <div key={`${input.name || "arg"}-${index}`}>
                                  <label className="mb-2 block text-sm font-medium text-slate-700">
                                    {input.name || `参数 ${index + 1}`}{" "}
                                    <span className="text-xs text-slate-400">
                                      {input.type}
                                    </span>
                                  </label>
                                  <input
                                    type="text"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                                    value={
                                      (argInputs[selectedFunction.signature] ??
                                        [])[index] ?? ""
                                    }
                                    onChange={(e) => {
                                      setArgInputs((prev) => {
                                        const next = {
                                          ...prev,
                                          [selectedFunction.signature]: [
                                            ...(prev[selectedFunction.signature] ??
                                              []),
                                          ],
                                        };
                                        next[selectedFunction.signature][index] =
                                          e.target.value;
                                        return next;
                                      });
                                    }}
                                    placeholder="请输入参数值"
                                  />
                                </div>
                              ))}
                            </div>

                            {selectedFunction.stateMutability === "payable" && (
                              <div className="mt-4">
                                <label className="mb-2 block text-sm font-medium text-slate-700">
                                  发送 ETH (可选)
                                </label>
                                <input
                                  type="text"
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                                  value={payableValue}
                                  onChange={(e) => setPayableValue(e.target.value)}
                                  placeholder="例如 0.01"
                                />
                              </div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                type="button"
                                className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                onClick={handleSend}
                                disabled={isLoading}
                              >
                                {isLoading ? "发送中..." : "发送交易"}
                              </button>
                            </div>

                            {errorMessage && (
                              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                {errorMessage}
                              </div>
                            )}

                            {(txHash || resultOutput) && (
                              <div className="mt-4 grid gap-4">
                                {txHash && (
                                  <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">
                                      交易哈希
                                    </label>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                      {txHash}
                                    </div>
                                  </div>
                                )}
                                {resultOutput && (
                                  <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">
                                      输出结果
                                    </label>
                                    <textarea
                                      readOnly
                                      className="min-h-[120px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                      value={resultOutput}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-6 py-10 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.6)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                选择钱包
              </h3>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                onClick={() => setIsWalletModalOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-slate-500">目前仅支持 OKX Wallet。</p>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                onClick={() => {
                  const okxProvider = getOkxProvider();
                  if (!okxProvider) {
                    setErrorMessage("未检测到 OKX Wallet，请先安装或启用");
                    return;
                  }
                  handleConnect(okxProvider);
                }}
              >
                OKX Wallet
              </button>
              <button
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                onClick={() => setIsWalletModalOpen(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {copyMessage && (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.5)]">
          {copyMessage}
        </div>
      )}
    </div>
  );
};

export default ContractInteractor;
