"use client";

import { useState } from "react";
import { JsonRpcProvider } from "ethers";
import {
  DEFAULT_MAX_PROBE_INTERVAL,
  buildLogProbeFilter,
  findMaxSupportedInterval,
  normalizeRpcUrl,
} from "./rpc-check-utils";

type RpcCheckResult = {
  rpcUrl: string;
  chainId: string;
  latestBlock: number;
  supportsHistoricalEvents: boolean;
  maxInterval: number;
  attempts: number;
  reachedProbeLimit: boolean;
  lastProbeError: string;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "RPC 请求失败，请检查 URL 和网络连接";

const RpcCheck = () => {
  const [rpcUrl, setRpcUrl] = useState("");
  const [result, setResult] = useState<RpcCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const handleClear = () => {
    setRpcUrl("");
    setResult(null);
    setErrorMessage("");
    setIsChecking(false);
  };

  const handleCheck = async () => {
    setErrorMessage("");
    setResult(null);
    setIsChecking(true);

    try {
      const normalizedRpcUrl = normalizeRpcUrl(rpcUrl);
      const provider = new JsonRpcProvider(normalizedRpcUrl);
      const [network, latestBlock] = await Promise.all([
        provider.getNetwork(),
        provider.getBlockNumber(),
      ]);

      let lastProbeError = "";
      const probe = async (fromBlock: number, toBlock: number) => {
        try {
          await provider.send("eth_getLogs", [buildLogProbeFilter(fromBlock, toBlock)]);
          return true;
        } catch (error) {
          lastProbeError = getErrorMessage(error);
          return false;
        }
      };

      const intervalResult = await findMaxSupportedInterval(latestBlock, probe);
      setResult({
        rpcUrl: normalizedRpcUrl,
        chainId: network.chainId.toString(),
        latestBlock,
        supportsHistoricalEvents: intervalResult.supported,
        maxInterval: intervalResult.maxInterval,
        attempts: intervalResult.attempts,
        reachedProbeLimit: intervalResult.reachedProbeLimit,
        lastProbeError,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsChecking(false);
    }
  };

  const maxIntervalLabel = result
    ? result.reachedProbeLimit
      ? `≥ ${result.maxInterval.toLocaleString()}`
      : result.maxInterval.toLocaleString()
    : "—";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">RPC 检查</h1>
        <p className="max-w-3xl text-sm text-slate-600 md:text-base">
          输入 EVM RPC URL，检测它是否支持历史事件扫描，并估算单次 eth_getLogs 请求可接受的最大区块间隔。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">检查 RPC 能力</h2>
            <p className="mt-1 text-sm text-slate-500">
              将从 1 个区块开始探测，逐步扩大到最近 {DEFAULT_MAX_PROBE_INTERVAL.toLocaleString()} 个区块。
            </p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            eth_getLogs
          </span>
        </div>

        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="rpc-url">
          RPC URL
        </label>
        <input
          id="rpc-url"
          type="url"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
          value={rpcUrl}
          onChange={(event) => {
            setRpcUrl(event.target.value);
            setErrorMessage("");
            setResult(null);
          }}
          placeholder="https://your-rpc-endpoint.example"
          autoComplete="url"
        />

        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={handleCheck}
            disabled={isChecking}
          >
            {isChecking ? "检查中..." : "开始检查"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
            onClick={handleClear}
          >
            清空
          </button>
        </div>
      </section>

      {result && (
        <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div
            className={`rounded-2xl border px-4 py-4 ${
              result.supportsHistoricalEvents
                ? "border-emerald-100 bg-emerald-50"
                : "border-rose-100 bg-rose-50"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                result.supportsHistoricalEvents ? "text-emerald-800" : "text-rose-800"
              }`}
            >
              {result.supportsHistoricalEvents
                ? "支持历史事件扫描"
                : "不支持历史事件扫描，或当前 RPC 拒绝 eth_getLogs 请求"}
            </p>
            <p className="mt-1 break-all text-xs text-slate-600">{result.rpcUrl}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Chain ID", value: result.chainId },
              { label: "最新区块", value: result.latestBlock.toLocaleString() },
              { label: "最大区块间隔", value: result.supportsHistoricalEvents ? maxIntervalLabel : "不支持" },
              { label: "探测请求次数", value: result.attempts.toLocaleString() },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 break-all font-mono text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p>
              本次使用不指定合约地址和 topic 的宽范围 <code className="font-mono text-xs">eth_getLogs</code> 测试，区块间隔包含首尾。
              {result.reachedProbeLimit && " 当前结果已达到 10,000 区块探测上限，实际能力可能更高。"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              实际扫描某个合约时，还可能受到返回日志数量、节点供应商限流和单次响应大小的影响。
            </p>
            {result.lastProbeError && (
              <p className="mt-2 break-words text-xs text-slate-500">
                最近一次被拒绝的探测：{result.lastProbeError}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default RpcCheck;
