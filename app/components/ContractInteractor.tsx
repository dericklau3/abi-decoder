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
  encodeFunctionCalldata,
  extractContractErrorMessage,
  type IntegerUnit,
  isIntegerParamType,
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

const INTEGER_UNITS: Array<IntegerUnit> = ["wei", "gwei", "ether"];

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
  const [expandedSignatures, setExpandedSignatures] = useState<Record<string, boolean>>({});
  const [argInputs, setArgInputs] = useState<Record<string, string[]>>({});
  const [argUnits, setArgUnits] = useState<Record<string, IntegerUnit[]>>({});
  const [payableValues, setPayableValues] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [injected, setInjected] = useState<ReturnType<typeof useWallet>["injected"]>(null);
  const [account, setAccount] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});
  const [resultOutputs, setResultOutputs] = useState<Record<string, string>>({});
  const [txHashes, setTxHashes] = useState<Record<string, string>>({});
  const [loadingSignatures, setLoadingSignatures] = useState<Record<string, boolean>>({});
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

  const getCalldataPreview = (fn: FunctionInfo) => {
    if (
      !abi ||
      fn.stateMutability === "view" ||
      fn.stateMutability === "pure"
    ) {
      return { data: "", error: "" };
    }

    const currentInputs = argInputs[fn.signature] ?? [];
    const currentUnits = argUnits[fn.signature] ?? [];
    const hasMissingInput = fn.inputs.some(
      (_, index) => !(currentInputs[index] ?? "").trim(),
    );
    if (hasMissingInput) {
      return { data: "", error: "填写参数后生成调用 data" };
    }

    try {
      return {
        data: encodeFunctionCalldata(
          abi,
          fn.signature,
          fn.inputs,
          currentInputs,
          currentUnits,
        ),
        error: "",
      };
    } catch (err) {
      return {
        data: "",
        error: `参数格式无效，暂不能编码 data：${extractContractErrorMessage(err)}`,
      };
    }
  };

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

  const resetOutputs = (signature: string) => {
    setErrorMessages((prev) => ({ ...prev, [signature]: "" }));
    setResultOutputs((prev) => ({ ...prev, [signature]: "" }));
    setTxHashes((prev) => ({ ...prev, [signature]: "" }));
    setLoadingSignatures((prev) => ({ ...prev, [signature]: false }));
  };

  const handleToggleFunction = (signature: string) => {
    setExpandedSignatures((prev) => ({
      ...prev,
      [signature]: !prev[signature],
    }));
  };

  const updateArgInput = (signature: string, index: number, value: string) => {
    setArgInputs((prev) => {
      const next = {
        ...prev,
        [signature]: [...(prev[signature] ?? [])],
      };
      next[signature][index] = value;
      return next;
    });
  };

  const updateArgUnit = (signature: string, index: number, unit: IntegerUnit) => {
    setArgUnits((prev) => {
      const next = {
        ...prev,
        [signature]: [...(prev[signature] ?? [])],
      };
      next[signature][index] = unit;
      return next;
    });
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

  const updatePayableValue = (signature: string, value: string) => {
    setPayableValues((prev) => ({
      ...prev,
      [signature]: value,
    }));
  };

  const handleCopyCalldata = async (data: string) => {
    if (!data) {
      setCopyMessage("暂无可复制 data");
      return;
    }
    try {
      await navigator.clipboard.writeText(data);
      setCopyMessage("调用 data 已复制");
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  const setFunctionError = (signature: string, message: string) => {
    setErrorMessages((prev) => ({ ...prev, [signature]: message }));
  };

  const setFunctionLoading = (signature: string, isLoading: boolean) => {
    setLoadingSignatures((prev) => ({ ...prev, [signature]: isLoading }));
  };

  const ensureInputs = (fn: FunctionInfo) => {
    const currentInputs = argInputs[fn.signature] ?? [];
    const missing = fn.inputs.some(
      (_, index) => !(currentInputs[index] ?? "").trim(),
    );
    if (missing) {
      setFunctionError(fn.signature, "请填写所有参数");
      return false;
    }
    return true;
  };

  const handleCall = async (fnInfo: FunctionInfo) => {
    resetOutputs(fnInfo.signature);
    if (!provider) {
      setFunctionError(fnInfo.signature, "请先连接钱包");
      return;
    }
    if (!ensureInputs(fnInfo)) {
      return;
    }
    const normalizedAddress = normalizeAddressInput(addressInput);
    if (!normalizedAddress) {
      setFunctionError(fnInfo.signature, "请输入合约地址");
      return;
    }
    if (!abi) {
      setFunctionError(fnInfo.signature, "请选择 ABI");
      return;
    }
    try {
      setFunctionLoading(fnInfo.signature, true);
      const checksummed = getAddress(normalizedAddress);
      const code = await provider.getCode(checksummed);
      if (code === "0x") {
        throw new Error("当前链上未找到该合约地址，请检查合约地址与钱包网络是否匹配");
      }
      const contract = new Contract(checksummed, abi, provider);
      const currentInputs = argInputs[fnInfo.signature] ?? [];
      const currentUnits = argUnits[fnInfo.signature] ?? [];
      const args = fnInfo.inputs.map((_, index) =>
        parseArgumentValue(
          fnInfo.inputs[index]?.type ?? "string",
          currentInputs[index] ?? "",
          currentUnits[index] ?? "wei",
        ),
      );
      const fn = contract.getFunction(fnInfo.signature);
      const result = await fn(...args);
      setResultOutputs((prev) => ({
        ...prev,
        [fnInfo.signature]: formatResult(result),
      }));
    } catch (err) {
      setFunctionError(fnInfo.signature, "调用失败：" + extractContractErrorMessage(err));
    } finally {
      setFunctionLoading(fnInfo.signature, false);
    }
  };

  const handleSend = async (fnInfo: FunctionInfo) => {
    resetOutputs(fnInfo.signature);
    if (!provider) {
      setFunctionError(fnInfo.signature, "请先连接钱包");
      return;
    }
    if (!ensureInputs(fnInfo)) {
      return;
    }
    const normalizedAddress = normalizeAddressInput(addressInput);
    if (!normalizedAddress) {
      setFunctionError(fnInfo.signature, "请输入合约地址");
      return;
    }
    if (!abi) {
      setFunctionError(fnInfo.signature, "请选择 ABI");
      return;
    }
    try {
      setFunctionLoading(fnInfo.signature, true);
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
      const currentInputs = argInputs[fnInfo.signature] ?? [];
      const currentUnits = argUnits[fnInfo.signature] ?? [];
      const args = fnInfo.inputs.map((_, index) =>
        parseArgumentValue(
          fnInfo.inputs[index]?.type ?? "string",
          currentInputs[index] ?? "",
          currentUnits[index] ?? "wei",
        ),
      );
      const fn = contract.getFunction(fnInfo.signature);
      const txArgs = appendTransactionOverrides(
        args,
        fnInfo.stateMutability,
        payableValues[fnInfo.signature] ?? "",
      ).map((item) =>
        typeof item === "object" &&
        item !== null &&
        "value" in item &&
        typeof (item as { value: unknown }).value === "string"
          ? { value: parseEther((item as { value: string }).value) }
          : item,
      );
      const tx = await fn(...txArgs);
      setTxHashes((prev) => ({ ...prev, [fnInfo.signature]: tx.hash }));
    } catch (err) {
      setFunctionError(
        fnInfo.signature,
        "交易发送失败：" + extractContractErrorMessage(err),
      );
    } finally {
      setFunctionLoading(fnInfo.signature, false);
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
                    const isExpanded = Boolean(expandedSignatures[item.signature]);
                    const isFunctionLoading = Boolean(loadingSignatures[item.signature]);
                    const errorMessage = errorMessages[item.signature] ?? "";
                    const resultOutput = resultOutputs[item.signature] ?? "";
                    const txHash = txHashes[item.signature] ?? "";
                    return (
                      <div key={item.signature} className="space-y-3">
                        <button
                          type="button"
                          className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                            isExpanded
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                          onClick={() => handleToggleFunction(item.signature)}
                        >
                          <div className="font-medium">{item.name}</div>
                          <div
                            className={`text-xs ${
                              isExpanded ? "text-slate-200" : "text-slate-500"
                            }`}
                          >
                            {item.signature}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="grid gap-3 md:grid-cols-2">
                              {item.inputs.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 md:col-span-2">
                                  此函数无输入参数
                                </div>
                              )}
                              {item.inputs.map((input, index) => (
                                <div key={`${input.name || "arg"}-${index}`}>
                                  <label className="mb-2 block text-sm font-medium text-slate-700">
                                    {input.name || `参数 ${index + 1}`}{" "}
                                    <span className="text-xs text-slate-400">
                                      {input.type}
                                    </span>
                                  </label>
                                  <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-slate-400">
                                    <input
                                      type="text"
                                      className="min-w-0 flex-1 border-0 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none"
                                      value={
                                        (argInputs[item.signature] ?? [])[index] ?? ""
                                      }
                                      onChange={(e) =>
                                        updateArgInput(
                                          item.signature,
                                          index,
                                          e.target.value,
                                        )
                                      }
                                      placeholder="请输入参数值"
                                    />
                                    {isIntegerParamType(input.type) && (
                                      <select
                                        className="w-24 border-l border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-600 focus:outline-none"
                                        value={
                                          (argUnits[item.signature] ?? [])[index] ?? "wei"
                                        }
                                        onChange={(e) =>
                                          updateArgUnit(
                                            item.signature,
                                            index,
                                            e.target.value as IntegerUnit,
                                          )
                                        }
                                      >
                                        {INTEGER_UNITS.map((unit) => (
                                          <option key={unit} value={unit}>
                                            {unit}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                type="button"
                                className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                onClick={() => handleCall(item)}
                                disabled={isFunctionLoading}
                              >
                                {isFunctionLoading ? "读取中..." : "读取合约"}
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
                    const isExpanded = Boolean(expandedSignatures[item.signature]);
                    const isFunctionLoading = Boolean(loadingSignatures[item.signature]);
                    const errorMessage = errorMessages[item.signature] ?? "";
                    const resultOutput = resultOutputs[item.signature] ?? "";
                    const txHash = txHashes[item.signature] ?? "";
                    const calldataPreview = getCalldataPreview(item);
                    return (
                      <div key={item.signature} className="space-y-3">
                        <button
                          type="button"
                          className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                            isExpanded
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                          onClick={() => handleToggleFunction(item.signature)}
                        >
                          <div className="font-medium">{item.name}</div>
                          <div
                            className={`text-xs ${
                              isExpanded ? "text-slate-200" : "text-slate-500"
                            }`}
                          >
                            {item.signature}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="grid gap-3 md:grid-cols-2">
                              {item.inputs.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 md:col-span-2">
                                  此函数无输入参数
                                </div>
                              )}
                              {item.inputs.map((input, index) => (
                                <div key={`${input.name || "arg"}-${index}`}>
                                  <label className="mb-2 block text-sm font-medium text-slate-700">
                                    {input.name || `参数 ${index + 1}`}{" "}
                                    <span className="text-xs text-slate-400">
                                      {input.type}
                                    </span>
                                  </label>
                                  <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-slate-400">
                                    <input
                                      type="text"
                                      className="min-w-0 flex-1 border-0 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none"
                                      value={
                                        (argInputs[item.signature] ?? [])[index] ?? ""
                                      }
                                      onChange={(e) =>
                                        updateArgInput(
                                          item.signature,
                                          index,
                                          e.target.value,
                                        )
                                      }
                                      placeholder="请输入参数值"
                                    />
                                    {isIntegerParamType(input.type) && (
                                      <select
                                        className="w-24 border-l border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-600 focus:outline-none"
                                        value={
                                          (argUnits[item.signature] ?? [])[index] ?? "wei"
                                        }
                                        onChange={(e) =>
                                          updateArgUnit(
                                            item.signature,
                                            index,
                                            e.target.value as IntegerUnit,
                                          )
                                        }
                                      >
                                        {INTEGER_UNITS.map((unit) => (
                                          <option key={unit} value={unit}>
                                            {unit}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {item.stateMutability === "payable" && (
                              <div className="mt-4">
                                <label className="mb-2 block text-sm font-medium text-slate-700">
                                  发送 ETH (可选)
                                </label>
                                <input
                                  type="text"
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                                  value={payableValues[item.signature] ?? ""}
                                  onChange={(e) =>
                                    updatePayableValue(item.signature, e.target.value)
                                  }
                                  placeholder="例如 0.01"
                                />
                              </div>
                            )}

                            <div className="mt-4">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <label className="block text-sm font-medium text-slate-700">
                                  调用 data
                                </label>
                                <button
                                  type="button"
                                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={() => handleCopyCalldata(calldataPreview.data)}
                                  disabled={!calldataPreview.data}
                                  aria-label="复制调用 data"
                                  title="复制调用 data"
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
                              {calldataPreview.data ? (
                                <textarea
                                  readOnly
                                  className="min-h-[112px] w-full resize-y break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                                  value={calldataPreview.data}
                                />
                              ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                  {calldataPreview.error || "选择写入函数后生成调用 data"}
                                </div>
                              )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                type="button"
                                className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                onClick={() => handleSend(item)}
                                disabled={isFunctionLoading}
                              >
                                {isFunctionLoading ? "发送中..." : "发送交易"}
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
