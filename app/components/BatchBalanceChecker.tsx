"use client";

import { useMemo, useState } from "react";
import { Contract, formatEther } from "ethers";
import { useWallet } from "./wallet/WalletProvider";
import {
  formatTokenBalance,
  normalizeErc20TokenAddress,
  parseBalanceAddressInput,
} from "./batch-balance-utils";
import { extractContractErrorMessage } from "./contract-interaction-utils";

type BalanceAssetType = "native" | "erc20";

type BalanceResult = {
  index: number;
  address: string;
  status: "pending" | "success" | "failed";
  balance?: string;
  error?: string;
};

const ERC20_BALANCE_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const shortAddress = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

const BatchBalanceChecker = () => {
  const {
    provider,
    networkName,
    nativeCurrencySymbol,
    chainId,
    openWalletModal,
  } = useWallet();
  const [assetType, setAssetType] = useState<BalanceAssetType>("native");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [addressesText, setAddressesText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [results, setResults] = useState<BalanceResult[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const preview = useMemo(() => {
    try {
      const addresses = parseBalanceAddressInput(addressesText);
      return { addresses, error: "" };
    } catch (error) {
      return {
        addresses: [],
        error: error instanceof Error ? error.message : "地址解析失败",
      };
    }
  }, [addressesText]);

  const chainLabel =
    chainId === null
      ? "未连接"
      : `${networkName && networkName !== "unknown" ? networkName : "Chain"} (#${chainId})`;
  const balanceSymbol =
    assetType === "erc20" ? tokenSymbol || "Token" : nativeCurrencySymbol || "ETH";

  const successfulResults = results.filter((item) => item.status === "success");
  const totalBalance = successfulResults.reduce((sum, item) => {
    if (!item.balance) {
      return sum;
    }
    return sum + Number(item.balance);
  }, 0);

  const updateResult = (index: number, next: Partial<BalanceResult>) => {
    setResults((previous) =>
      previous.map((item) => (item.index === index ? { ...item, ...next } : item)),
    );
  };

  const handleQuery = async () => {
    setErrorMessage("");
    setCopyMessage("");
    setResults([]);

    if (!provider) {
      setErrorMessage("请先连接钱包，使用当前钱包网络查询余额");
      openWalletModal();
      return;
    }

    let addresses: string[] = [];
    try {
      addresses = parseBalanceAddressInput(addressesText);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "地址解析失败");
      return;
    }

    let tokenContract: Contract | null = null;
    let resolvedTokenSymbol = "Token";
    let resolvedTokenDecimals = 18;

    if (assetType === "erc20") {
      let checksummedToken = "";
      try {
        checksummedToken = normalizeErc20TokenAddress(tokenAddress);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "请输入有效的 ERC20 合约地址",
        );
        return;
      }

      try {
        const code = await provider.getCode(checksummedToken);
        if (code === "0x") {
          throw new Error("当前链上未找到 ERC20 合约，请检查 Token 地址与钱包网络");
        }

        tokenContract = new Contract(checksummedToken, ERC20_BALANCE_ABI, provider);
        const [symbolResult, decimalsResult] = await Promise.allSettled([
          tokenContract.symbol(),
          tokenContract.decimals(),
        ]);

        if (
          symbolResult.status === "fulfilled" &&
          typeof symbolResult.value === "string" &&
          symbolResult.value.trim()
        ) {
          resolvedTokenSymbol = symbolResult.value.trim();
        }

        if (decimalsResult.status === "fulfilled") {
          const nextDecimals = Number(decimalsResult.value);
          if (Number.isInteger(nextDecimals) && nextDecimals >= 0) {
            resolvedTokenDecimals = nextDecimals;
          }
        }

        setTokenSymbol(resolvedTokenSymbol);
        setTokenDecimals(resolvedTokenDecimals);
      } catch (error) {
        setErrorMessage("Token 信息读取失败：" + extractContractErrorMessage(error));
        return;
      }
    }

    const initialResults = addresses.map((address, index) => ({
      index,
      address,
      status: "pending" as const,
    }));
    setResults(initialResults);

    try {
      setIsQuerying(true);
      await Promise.all(
        addresses.map(async (address, index) => {
          try {
            const balance =
              assetType === "erc20" && tokenContract
                ? ((await tokenContract.balanceOf(address)) as bigint)
                : await provider.getBalance(address);
            updateResult(index, {
              status: "success",
              balance:
                assetType === "erc20"
                  ? formatTokenBalance(balance, resolvedTokenDecimals)
                  : formatEther(balance),
            });
          } catch (error) {
            updateResult(index, {
              status: "failed",
              error: extractContractErrorMessage(error),
            });
          }
        }),
      );
    } finally {
      setIsQuerying(false);
    }
  };

  const handleCopyResults = async () => {
    const text = results
      .map((item) =>
        [
          item.address,
          item.status === "success" ? item.balance ?? "0" : item.error ?? "查询失败",
        ].join("\t"),
      )
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("查询结果已复制");
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          批量查余额
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          输入一批 EVM 地址，使用当前连接钱包所在网络批量查询原生币或 ERC20 余额。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">查询网络</h2>
            <p className="mt-1 text-sm text-slate-500">
              余额会从当前钱包连接的链上读取，切换钱包网络后再查询即可换链。
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
            onClick={openWalletModal}
          >
            {chainLabel}
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { label: "原生币", value: "native" as const },
            { label: "ERC20", value: "erc20" as const },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                assetType === item.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
              onClick={() => {
                setAssetType(item.value);
                setErrorMessage("");
                setCopyMessage("");
                setResults([]);
                if (item.value === "native") {
                  setTokenSymbol("");
                  setTokenDecimals(18);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {assetType === "erc20" && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              ERC20 合约地址
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={tokenAddress}
              onChange={(event) => {
                setTokenAddress(event.target.value);
                setTokenSymbol("");
                setTokenDecimals(18);
                setErrorMessage("");
                setCopyMessage("");
                setResults([]);
              }}
              placeholder="0x..."
            />
          </div>
        )}

        <label className="mb-2 block text-sm font-medium text-slate-700">
          EVM 地址
        </label>
        <textarea
          className="min-h-72 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
          value={addressesText}
          onChange={(event) => {
            setAddressesText(event.target.value);
            setErrorMessage("");
            setCopyMessage("");
          }}
          placeholder={"每行一个地址，也支持逗号或空格分隔\n0x...\n0x..."}
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            {preview.addresses.length > 0
              ? `将查询 ${preview.addresses.length} 个去重后的地址`
              : preview.error || "等待输入地址"}
          </div>
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            onClick={handleQuery}
            disabled={isQuerying}
          >
            {isQuerying ? "查询中..." : "查询余额"}
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">查询结果</h2>
            <p className="mt-1 text-sm text-slate-500">
            成功 {successfulResults.length} 个，总余额约 {totalBalance.toLocaleString()}{" "}
            {balanceSymbol}
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            onClick={handleCopyResults}
            disabled={results.length === 0}
          >
            复制结果
          </button>
        </div>

        {copyMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {copyMessage}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[80px_minmax(0,1fr)_minmax(160px,220px)] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <span>#</span>
            <span>Address</span>
            <span>{balanceSymbol}</span>
          </div>
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              查询后会在这里显示每个地址的
              {assetType === "erc20" ? " ERC20 Token " : "原生币"}
              余额
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {results.map((item) => (
                <div
                  key={item.address}
                  className="grid grid-cols-[80px_minmax(0,1fr)_minmax(160px,220px)] items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-slate-400">{item.index + 1}</span>
                  <span className="min-w-0 break-all font-mono text-slate-700">
                    <span className="sm:hidden">{shortAddress(item.address)}</span>
                    <span className="hidden sm:inline">{item.address}</span>
                  </span>
                  <span
                    className={`font-mono ${
                      item.status === "failed" ? "text-rose-600" : "text-slate-900"
                    }`}
                  >
                    {item.status === "pending"
                      ? "查询中..."
                      : item.status === "failed"
                        ? item.error ?? "查询失败"
                        : item.balance}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BatchBalanceChecker;
