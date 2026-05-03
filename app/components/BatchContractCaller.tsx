"use client";

import { useEffect, useMemo, useState } from "react";
import { Contract, getAddress, Interface, Wallet } from "ethers";
import { useWallet } from "./wallet/WalletProvider";
import {
  extractContractErrorMessage,
  normalizeAddressInput,
} from "./contract-interaction-utils";
import {
  BatchCallFunctionInfo,
  getWritableFunctionInfos,
  getPrivateKeyAddressPreviews,
  parsePrivateKeyLines,
  prepareBatchCallArgs,
} from "./batch-call-utils";

type SavedAbi = { name: string; abi: string };

type CallResult = {
  index: number;
  address: string;
  status: "pending" | "success" | "failed";
  txHash?: string;
  error?: string;
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
  } catch {
    return { abi: null, error: "ABI JSON 解析失败" };
  }
};

const getChainLabel = (name: string, chainId: number | null) => {
  if (name && name !== "unknown") {
    return name;
  }
  return chainId === null ? "未连接" : "Chain";
};

const shortAddress = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

const BatchContractCaller = () => {
  const { provider, networkName, chainId, openWalletModal } = useWallet();
  const [contractAddress, setContractAddress] = useState("");
  const [privateKeysText, setPrivateKeysText] = useState("");
  const [savedAbis, setSavedAbis] = useState<Array<SavedAbi>>([]);
  const [selectedAbiIndex, setSelectedAbiIndex] = useState<number | null>(null);
  const [abiInput, setAbiInput] = useState("");
  const [selectedSignature, setSelectedSignature] = useState("");
  const [argInputs, setArgInputs] = useState<Record<string, string[]>>({});
  const [payableValue, setPayableValue] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [results, setResults] = useState<CallResult[]>([]);
  const [isCalling, setIsCalling] = useState(false);

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

  const { abi, error: abiError } = useMemo(
    () => parseAbiJson(abiInput),
    [abiInput],
  );

  const functions = useMemo<BatchCallFunctionInfo[]>(() => {
    if (!abi) {
      return [];
    }
    try {
      return getWritableFunctionInfos(abi);
    } catch {
      return [];
    }
  }, [abi]);

  const selectedFunction = useMemo(
    () => functions.find((item) => item.signature === selectedSignature) ?? null,
    [functions, selectedSignature],
  );

  const privateKeyPreviews = useMemo(
    () => getPrivateKeyAddressPreviews(privateKeysText),
    [privateKeysText],
  );

  const calldataPreview = useMemo(() => {
    if (!abi || !selectedFunction) {
      return { data: "", error: "" };
    }
    const currentInputs = argInputs[selectedFunction.signature] ?? [];
    const hasMissingInput = selectedFunction.inputs.some(
      (_, index) => !(currentInputs[index] ?? "").trim(),
    );
    if (hasMissingInput) {
      return { data: "", error: "填写参数后生成调用 data" };
    }

    try {
      const iface = new Interface(abi);
      const args = prepareBatchCallArgs(
        selectedFunction,
        currentInputs,
        payableValue,
      ).filter(
        (item) =>
          !(
            typeof item === "object" &&
            item !== null &&
            "value" in item
          ),
      );
      return {
        data: iface.encodeFunctionData(selectedFunction.signature, args),
        error: "",
      };
    } catch (error) {
      return {
        data: "",
        error: `参数格式无效，暂不能编码 data：${extractContractErrorMessage(error)}`,
      };
    }
  }, [abi, argInputs, payableValue, selectedFunction]);

  const handleSelectAbi = (indexValue: string) => {
    setErrorMessage("");
    setResults([]);
    setSelectedSignature("");
    setPayableValue("");
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

  const handleSelectFunction = (signature: string) => {
    setSelectedSignature(signature);
    setPayableValue("");
    setErrorMessage("");
    setResults([]);
  };

  const ensureInputs = () => {
    if (!selectedFunction) {
      setErrorMessage("请选择要调用的方法");
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

  const updateResult = (index: number, next: Partial<CallResult>) => {
    setResults((previous) =>
      previous.map((item) => (item.index === index ? { ...item, ...next } : item)),
    );
  };

  const handleBatchCall = async () => {
    setErrorMessage("");
    setResults([]);
    if (!provider) {
      setErrorMessage("请先连接钱包或提供可用的浏览器钱包网络");
      openWalletModal();
      return;
    }
    if (!abi) {
      setErrorMessage("请选择 ABI");
      return;
    }
    if (!ensureInputs() || !selectedFunction) {
      return;
    }

    let checksummedContract = "";
    let privateKeys: string[] = [];
    try {
      checksummedContract = getAddress(normalizeAddressInput(contractAddress));
      privateKeys = parsePrivateKeyLines(privateKeysText);
    } catch (error) {
      setErrorMessage(extractContractErrorMessage(error));
      return;
    }

    try {
      setIsCalling(true);
      const code = await provider.getCode(checksummedContract);
      if (code === "0x") {
        throw new Error("当前链上未找到该合约地址，请检查合约地址与网络");
      }

      const currentInputs = argInputs[selectedFunction.signature] ?? [];
      const txArgs = prepareBatchCallArgs(
        selectedFunction,
        currentInputs,
        payableValue,
      );
      const wallets = privateKeys.map((privateKey, index) => {
        const wallet = new Wallet(privateKey, provider);
        return {
          index,
          wallet,
        };
      });

      setResults(
        wallets.map(({ index, wallet }) => ({
          index,
          address: wallet.address,
          status: "pending",
        })),
      );

      for (const { index, wallet } of wallets) {
        try {
          const contract = new Contract(checksummedContract, abi, wallet);
          const fn = contract.getFunction(selectedFunction.signature);
          const tx = await fn(...txArgs);
          updateResult(index, { status: "success", txHash: tx.hash });
        } catch (error) {
          updateResult(index, {
            status: "failed",
            error: extractContractErrorMessage(error),
          });
        }
      }
    } catch (error) {
      setErrorMessage("批量调用失败：" + extractContractErrorMessage(error));
    } finally {
      setIsCalling(false);
    }
  };

  const chainLabel =
    chainId === null
      ? "未连接"
      : `${getChainLabel(networkName, chainId)} (#${chainId})`;
  const successCount = results.filter((item) => item.status === "success").length;
  const failedCount = results.filter((item) => item.status === "failed").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          批量调用
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          输入多个私钥后，对同一个合约 ABI 的 nonpayable/payable 方法逐个发起交易。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">基础信息</h2>
            <p className="mt-1 text-sm text-slate-500">
              私钥只在当前页面用于签名，不保存到浏览器存储。
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            当前链 {chainLabel}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              合约地址
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={contractAddress}
              onChange={(event) => setContractAddress(event.target.value)}
              placeholder="0x..."
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              ABI 列表
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={selectedAbiIndex === null ? "" : String(selectedAbiIndex)}
              onChange={(event) => handleSelectAbi(event.target.value)}
            >
              <option value="">请选择 ABI</option>
              {savedAbis.map((item, index) => (
                <option key={`${item.name}-${index}`} value={index}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            私钥
          </label>
          <textarea
            className="min-h-[150px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
            value={privateKeysText}
            onChange={(event) => setPrivateKeysText(event.target.value)}
            placeholder={"每行一个私钥\n0x...\n0x..."}
          />
        </div>

        {privateKeyPreviews.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">账号预览</h3>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                {privateKeyPreviews.length} 个
              </span>
            </div>
            <div className="space-y-2">
              {privateKeyPreviews.map((item) => (
                <div
                  key={`${item.index}-${item.privateKey}`}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      第 {item.index + 1} 行
                    </span>
                    {item.address ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        有效
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                        无效
                      </span>
                    )}
                  </div>
                  {item.address ? (
                    <div className="mt-2 break-all font-mono text-xs text-slate-700">
                      {item.address}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-rose-700">{item.error}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {savedAbis.length === 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            暂无 ABI，请先前往 ABI 管理页面添加。
          </div>
        )}
        {abiError && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {abiError}
          </div>
        )}
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">调用方法</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            {functions.length} 个交易方法
          </span>
        </div>

        {functions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            请选择包含 nonpayable/payable 方法的 ABI
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {functions.map((item) => {
              const isActive = item.signature === selectedSignature;
              return (
                <button
                  key={item.signature}
                  type="button"
                  className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                  onClick={() => handleSelectFunction(item.signature)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{item.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isActive
                          ? "bg-white/10 text-slate-100"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.stateMutability}
                    </span>
                  </div>
                  <div className={isActive ? "text-xs text-slate-200" : "text-xs text-slate-500"}>
                    {item.signature}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedFunction && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {selectedFunction.inputs.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500 md:col-span-2">
                  此方法无输入参数
                </div>
              )}
              {selectedFunction.inputs.map((input, index) => (
                <div key={`${input.name || "arg"}-${index}`}>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    {input.name || `参数 ${index + 1}`}{" "}
                    <span className="text-xs text-slate-400">{input.type}</span>
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={(argInputs[selectedFunction.signature] ?? [])[index] ?? ""}
                    onChange={(event) => {
                      setArgInputs((previous) => {
                        const next = {
                          ...previous,
                          [selectedFunction.signature]: [
                            ...(previous[selectedFunction.signature] ?? []),
                          ],
                        };
                        next[selectedFunction.signature][index] = event.target.value;
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
                  每个账号发送 ETH
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={payableValue}
                  onChange={(event) => setPayableValue(event.target.value)}
                  placeholder="例如 0.01，留空则不附带 ETH"
                />
              </div>
            )}

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                调用 data
              </label>
              {calldataPreview.data ? (
                <textarea
                  readOnly
                  className="min-h-[90px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700"
                  value={calldataPreview.data}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                  {calldataPreview.error || "选择方法后生成调用 data"}
                </div>
              )}
            </div>

            <button
              type="button"
              className="mt-4 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleBatchCall}
              disabled={isCalling}
            >
              {isCalling ? "调用中..." : "批量调用"}
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}
      </section>

      {results.length > 0 && (
        <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">调用结果</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-500">
                总计 {results.length}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                成功 {successCount}
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
                失败 {failedCount}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {results.map((item) => (
              <div
                key={`${item.index}-${item.address}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      #{item.index + 1} {shortAddress(item.address)}
                    </div>
                    <div className="mt-1 break-all text-xs text-slate-500">
                      {item.address}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.status === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : item.status === "failed"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {item.status === "success"
                      ? "已发送"
                      : item.status === "failed"
                        ? "失败"
                        : "等待中"}
                  </span>
                </div>
                {item.txHash && (
                  <div className="mt-3 break-all rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-600">
                    {item.txHash}
                  </div>
                )}
                {item.error && (
                  <div className="mt-3 rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-rose-700">
                    {item.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default BatchContractCaller;
