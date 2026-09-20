"use client";

import { useEffect, useRef, useState } from "react";
import { FetchRequest, JsonRpcProvider } from "ethers";
import {
  DEFAULT_MAX_PROBE_INTERVAL,
  probeLogRange,
  findMaxSupportedInterval,
  normalizeRpcUrl,
} from "./rpc-check-utils";

type RpcCheckResult = {
  rpcUrl: string;
  chainId: string;
  latestBlock: number;
  supported: boolean;
  maxInterval: number;
  attempts: number;
  reachedProbeLimit: boolean;
  stopReason?: string;
  reportedMaxInterval?: number;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "RPC 请求失败，请检查 URL 和网络连接";

const RpcCheck = () => {
  const [rpcUrl, setRpcUrl] = useState("");
  const runId = useRef(0);
  const activeProvider = useRef<JsonRpcProvider | null>(null);
  useEffect(() => () => {
    runId.current += 1;
    activeProvider.current?.destroy();
  }, []);
  const [result, setResult] = useState<RpcCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const cancelCheck = () => {
    runId.current += 1;
    activeProvider.current?.destroy();
    activeProvider.current = null;
    setIsChecking(false);
    setResult(null);
    setErrorMessage("");
  };

  const handleClear = () => {
    cancelCheck();
    setRpcUrl("");
    setResult(null);
    setErrorMessage("");
    setIsChecking(false);
  };

  const handleCheck = async () => {
    cancelCheck();
    const currentRun = runId.current;
    setIsChecking(true);
    let provider: JsonRpcProvider | undefined;
    try {
      const normalizedRpcUrl = normalizeRpcUrl(rpcUrl);
      const request = new FetchRequest(normalizedRpcUrl);
      request.timeout = 15_000;
      provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
      activeProvider.current = provider;
      const [network, latestBlock] = await Promise.all([
        provider.getNetwork(),
        provider.getBlockNumber(),
      ]);
      const client = provider;
      const intervalResult = await findMaxSupportedInterval(latestBlock, (fromBlock, toBlock) => {
        if (currentRun !== runId.current) throw new Error("检查已取消");
        return probeLogRange((method, params) => client.send(method, params), fromBlock, toBlock);
      });
      if (currentRun !== runId.current) return;
      setResult({
        rpcUrl: normalizedRpcUrl,
        chainId: network.chainId.toString(),
        latestBlock,
        ...intervalResult,
      });
    } catch (error) {
      if (currentRun === runId.current) setErrorMessage(getErrorMessage(error));
    } finally {
      provider?.destroy();
      if (currentRun === runId.current) {
        activeProvider.current = null;
        setIsChecking(false);
      }
    }
  };

  const maxIntervalLabel = result?.reportedMaxInterval !== undefined
    ? `${result.reportedMaxInterval.toLocaleString()}（RPC 返回）`
    : result?.supported ? `≥ ${result.maxInterval.toLocaleString()}` : "无法确定";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">RPC 检查</h1>
        <p className="max-w-3xl text-sm text-slate-600 md:text-base">
          输入 EVM RPC URL，验证 eth_getLogs 的查询范围。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">检查 RPC 能力</h2>
            <p className="mt-1 text-sm text-slate-500">
              直接请求 {DEFAULT_MAX_PROBE_INTERVAL.toLocaleString()} 个区块（包含首尾），根据 RPC 报错读取范围上限，不再逐步探测。
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
            cancelCheck();
            setRpcUrl(event.target.value);
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
              result.supported
                ? "border-emerald-100 bg-emerald-50"
                : "border-rose-100 bg-rose-50"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                result.supported ? "text-emerald-800" : "text-rose-800"
              }`}
            >
              {result.supported
                ? "指定条件下的日志查询已通过"
                : result.reportedMaxInterval !== undefined ? "RPC 已返回区块范围上限" : "本次未能确定区块范围上限"}
            </p>
            <p className="mt-1 break-all text-xs text-slate-600">{result.rpcUrl}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Chain ID", value: result.chainId },
              { label: "最新区块", value: result.latestBlock.toLocaleString() },
              { label: "区块范围上限", value: maxIntervalLabel },
              { label: "探测请求次数", value: result.attempts.toLocaleString() },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 break-all font-mono text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 break-all rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p>
              本次以最新区块为结束区块，直接请求 {DEFAULT_MAX_PROBE_INTERVAL.toLocaleString()} 个区块。
              {result.reachedProbeLimit && " 本次 100,000 区块查询成功，实际能力可能更高。"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              成功时显示已验证的下限；报错中有明确区块上限时直接展示该数值，未另外验证该上限。限流、超时和日志数量限制不能用来推算区块上限。
            </p>
            {result.stopReason && (
              <p className="mt-2 break-words text-xs text-slate-500">
                RPC 返回信息：{result.stopReason}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default RpcCheck;
