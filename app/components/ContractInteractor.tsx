"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserProvider,
  Contract,
  FunctionFragment,
  getAddress,
  Interface,
  parseEther,
} from "ethers";
import { useWallet } from "./wallet/WalletProvider";
import {
  appendTransactionOverrides,
  extractContractErrorMessage,
  normalizeAddressInput,
  parseArgumentValue,
} from "./contract-interaction-utils";

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

const getChainLabel = (name: string, chainId: number | null) => {
  if (name && name !== "unknown") {
    return name;
  }
  return `Chain ${chainId}`;
};

const ContractInteractor = () => {
  const {
    provider: sharedProvider,
    injected: sharedInjected,
    account: sharedAccount,
    networkName: sharedNetworkName,
    chainId: sharedChainId,
  } = useWallet();

  const [addressInput, setAddressInput] = useState("");
  const [abiInput, setAbiInput] = useState("");
  const [savedAbis, setSavedAbis] = useState<Array<SavedAbi>>([]);
  const [selectedAbiIndex, setSelectedAbiIndex] = useState<number | null>(null);
  const [selectedSignature, setSelectedSignature] = useState("");
  const [argInputs, setArgInputs] = useState<Record<string, string[]>>({});
  const [payableValue, setPayableValue] = useState("");
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [injected, setInjected] = useState<ReturnType<typeof useWallet>["injected"]>(null);
  const [account, setAccount] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [resultOutput, setResultOutput] = useState("");
  const [txHash, setTxHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    setProvider(sharedProvider);
    setInjected(sharedInjected);
    setAccount(sharedAccount);
    setNetworkName(sharedNetworkName);
    setChainId(sharedChainId);
  }, [sharedProvider, sharedInjected, sharedAccount, sharedNetworkName, sharedChainId]);

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
    if (!copyMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopyMessage("");
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

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
      const code = await provider.getCode(checksummed);
      if (code === "0x") {
        throw new Error("当前链上未找到该合约地址，请检查合约地址与钱包网络是否匹配");
      }
      const contract = new Contract(checksummed, abi, provider);
      const currentInputs = argInputs[selectedFunction.signature] ?? [];
      const args = selectedFunction.inputs.map((_, index) =>
        parseArgumentValue(
          selectedFunction.inputs[index]?.type ?? "string",
          currentInputs[index] ?? "",
        ),
      );
      const fn = contract.getFunction(selectedFunction.signature);
      const result = await fn(...args);
      setResultOutput(formatResult(result));
    } catch (err) {
      setErrorMessage("调用失败：" + extractContractErrorMessage(err));
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
      if (typeof injected?.request === "function") {
        await injected.request({ method: "eth_requestAccounts" });
      }
      const signer = await provider.getSigner();
      const checksummed = getAddress(normalizedAddress);
      const code = await provider.getCode(checksummed);
      if (code === "0x") {
        throw new Error("当前链上未找到该合约地址，请检查合约地址与钱包网络是否匹配");
      }
      const contract = new Contract(checksummed, abi, signer);
      const currentInputs = argInputs[selectedFunction.signature] ?? [];
      const args = selectedFunction.inputs.map((_, index) =>
        parseArgumentValue(
          selectedFunction.inputs[index]?.type ?? "string",
          currentInputs[index] ?? "",
        ),
      );
      const fn = contract.getFunction(selectedFunction.signature);
      const txArgs = appendTransactionOverrides(
        args,
        selectedFunction.stateMutability,
        payableValue,
      ).map((item) =>
        typeof item === "object" &&
        item !== null &&
        "value" in item &&
        typeof (item as { value: unknown }).value === "string"
          ? { value: parseEther((item as { value: string }).value) }
          : item,
      );
      const tx = await fn(...txArgs);
      setTxHash(tx.hash);
      setResultOutput("");
    } catch (err) {
      setErrorMessage("交易发送失败：" + extractContractErrorMessage(err));
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">基础信息</h2>
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

      {copyMessage && (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.5)]">
          {copyMessage}
        </div>
      )}
    </div>
  );
};

export default ContractInteractor;
