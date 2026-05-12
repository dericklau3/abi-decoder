"use client";

import { useEffect, useState } from "react";
import { JsonRpcProvider } from "ethers";
import {
  CHAIN_TIME_CONFIGS,
  ChainTimeKey,
  EASTERN_TIME_ZONE,
  SHANGHAI_TIME_ZONE,
  BlockTimestampPoint,
  estimateFutureBlockForTimestamp,
  estimateFutureTimestampForBlock,
  formatTimestampSecondsInZone,
  isFutureTimestamp,
  parseBlockHeightInput,
  timeTextToTimestampSeconds,
} from "./time-utils";

type BlockTimeResult = {
  rows: {
    label: string;
    value: string;
    copyable?: boolean;
  }[];
};

const ensureRpcUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入 RPC URL");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("RPC URL 需要是 http(s) 地址");
    }
    return trimmed;
  } catch (error) {
    if (error instanceof Error && error.message === "RPC URL 需要是 http(s) 地址") {
      throw error;
    }
    throw new Error("请输入有效的 RPC URL");
  }
};

const parseEthersBlock = (
  block: Awaited<ReturnType<JsonRpcProvider["getBlock"]>>,
): BlockTimestampPoint => {
  if (!block) {
    throw new Error("没有查询到对应区块");
  }

  if (!Number.isFinite(block.timestamp)) {
    throw new Error("RPC 返回了无效的区块时间");
  }

  return {
    number: BigInt(block.number),
    timestamp: block.timestamp,
  };
};

const getBlockByNumber = async (
  provider: JsonRpcProvider,
  blockNumber: bigint | "latest",
) => {
  if (blockNumber !== "latest" && blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("区块高度超出浏览器可安全查询范围");
  }

  const tag = blockNumber === "latest" ? "latest" : Number(blockNumber);
  return parseEthersBlock(await provider.getBlock(tag));
};

const parseTargetTimeInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入目标时间");
  }

  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return Number.parseInt(timeTextToTimestampSeconds(trimmed, SHANGHAI_TIME_ZONE), 10);
};

const TimeConverter = () => {
  const [timestampInput, setTimestampInput] = useState("");
  const [beijingTime, setBeijingTime] = useState("");
  const [easternTime, setEasternTime] = useState("");
  const [timestampError, setTimestampError] = useState("");
  const [beijingError, setBeijingError] = useState("");
  const [easternError, setEasternError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [chainKey, setChainKey] = useState<ChainTimeKey>("bsc");
  const [rpcUrl, setRpcUrl] = useState(CHAIN_TIME_CONFIGS.bsc.defaultRpcUrl);
  const [blockHeightInput, setBlockHeightInput] = useState("");
  const [targetTimeInput, setTargetTimeInput] = useState("");
  const [blockTimeResult, setBlockTimeResult] = useState<BlockTimeResult | null>(
    null,
  );
  const [blockTimeError, setBlockTimeError] = useState("");
  const [isBlockTimeLoading, setIsBlockTimeLoading] = useState(false);
  const [latestBlockNumber, setLatestBlockNumber] = useState("");
  const [latestBlockError, setLatestBlockError] = useState("");
  const [isLatestBlockLoading, setIsLatestBlockLoading] = useState(false);

  const selectedChain = CHAIN_TIME_CONFIGS[chainKey];
  const targetTimestampPreview = (() => {
    if (!targetTimeInput.trim()) {
      return null;
    }

    try {
      return parseTargetTimeInput(targetTimeInput);
    } catch {
      return null;
    }
  })();
  const isPastTargetTime =
    targetTimestampPreview !== null &&
    !isFutureTimestamp(targetTimestampPreview, Math.floor(Date.now() / 1000));

  const clearErrors = () => {
    setTimestampError("");
    setBeijingError("");
    setEasternError("");
  };

  const clearOutputs = () => {
    setTimestampInput("");
    setBeijingTime("");
    setEasternTime("");
  };

  const applyTimestamp = (value: string) => {
    clearErrors();
    setCopyMessage("");
    const trimmed = value.trim();
    if (!trimmed) {
      clearOutputs();
      return;
    }

    try {
      setTimestampInput(trimmed);
      setBeijingTime(formatTimestampSecondsInZone(trimmed, SHANGHAI_TIME_ZONE));
      setEasternTime(formatTimestampSecondsInZone(trimmed, EASTERN_TIME_ZONE));
    } catch (error) {
      setTimestampError(
        error instanceof Error ? error.message : "时间戳转换失败",
      );
      setBeijingTime("");
      setEasternTime("");
    }
  };

  const applyBeijingTime = (value: string) => {
    clearErrors();
    setCopyMessage("");
    setBeijingTime(value);
    if (!value.trim()) {
      clearOutputs();
      return;
    }

    try {
      const nextTimestamp = timeTextToTimestampSeconds(value, SHANGHAI_TIME_ZONE);
      setTimestampInput(nextTimestamp);
      setEasternTime(
        formatTimestampSecondsInZone(nextTimestamp, EASTERN_TIME_ZONE),
      );
    } catch (error) {
      setBeijingError(
        error instanceof Error ? error.message : "北京时间转换失败",
      );
      setTimestampInput("");
      setEasternTime("");
    }
  };

  const applyEasternTime = (value: string) => {
    clearErrors();
    setCopyMessage("");
    setEasternTime(value);
    if (!value.trim()) {
      clearOutputs();
      return;
    }

    try {
      const nextTimestamp = timeTextToTimestampSeconds(value, EASTERN_TIME_ZONE);
      setTimestampInput(nextTimestamp);
      setBeijingTime(
        formatTimestampSecondsInZone(nextTimestamp, SHANGHAI_TIME_ZONE),
      );
    } catch (error) {
      setEasternError(
        error instanceof Error ? error.message : "美东时间转换失败",
      );
      setTimestampInput("");
      setBeijingTime("");
    }
  };

  const fillCurrentTime = () => {
    applyTimestamp(Math.floor(Date.now() / 1000).toString());
  };

  const handleCopy = async (value: string, label: string) => {
    if (!value) {
      setCopyMessage(`${label} 为空，无法复制`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} 已复制`);
    } catch {
      setCopyMessage(`${label} 复制失败，请检查浏览器权限`);
    }
  };

  const handleChainChange = (value: ChainTimeKey) => {
    setChainKey(value);
    setRpcUrl(CHAIN_TIME_CONFIGS[value].defaultRpcUrl);
    setBlockHeightInput("");
    setBlockTimeResult(null);
    setBlockTimeError("");
    setLatestBlockError("");
    setCopyMessage("");
  };

  useEffect(() => {
    let isCanceled = false;

    const loadLatestBlock = async () => {
      setIsLatestBlockLoading(true);
      setLatestBlockError("");

      try {
        const provider = new JsonRpcProvider(ensureRpcUrl(rpcUrl));
        const latest = await getBlockByNumber(provider, "latest");
        if (isCanceled) {
          return;
        }

        const latestNumber = latest.number.toString();
        setLatestBlockNumber(latestNumber);
        setBlockHeightInput((currentValue) =>
          currentValue.trim() ? currentValue : latestNumber,
        );
      } catch (error) {
        if (isCanceled) {
          return;
        }

        setLatestBlockNumber("");
        setLatestBlockError(
          error instanceof Error ? error.message : "读取最新区块失败",
        );
      } finally {
        if (!isCanceled) {
          setIsLatestBlockLoading(false);
        }
      }
    };

    loadLatestBlock();

    return () => {
      isCanceled = true;
    };
  }, [rpcUrl]);

  const blockPointToRows = (
    block: BlockTimestampPoint,
    chainLabel: string,
    sourceLabel: string,
  ): BlockTimeResult => {
    const rows: BlockTimeResult["rows"] = [
      { label: "链", value: chainLabel },
      { label: "数据来源", value: sourceLabel },
      { label: "区块高度", value: block.number.toString(), copyable: true },
      { label: "时间戳（秒）", value: block.timestamp.toString(), copyable: true },
      {
        label: "北京时间",
        value: formatTimestampSecondsInZone(
          block.timestamp.toString(),
          SHANGHAI_TIME_ZONE,
        ),
        copyable: true,
      },
      {
        label: "美东时间",
        value: formatTimestampSecondsInZone(
          block.timestamp.toString(),
          EASTERN_TIME_ZONE,
        ),
        copyable: true,
      },
    ];

    return { rows };
  };

  const lookupBlockTime = async () => {
    setIsBlockTimeLoading(true);
    setBlockTimeError("");
    setBlockTimeResult(null);
    setCopyMessage("");

    try {
      const provider = new JsonRpcProvider(ensureRpcUrl(rpcUrl));
      const blockNumber = parseBlockHeightInput(blockHeightInput);
      const latest = await getBlockByNumber(provider, "latest");

      if (blockNumber <= latest.number) {
        const block = await getBlockByNumber(provider, blockNumber);
        setBlockTimeResult(blockPointToRows(block, selectedChain.label, "链上区块"));
        return;
      }

      const estimatedTimestamp = estimateFutureTimestampForBlock({
        latestBlockNumber: latest.number,
        latestTimestamp: latest.timestamp,
        targetBlockNumber: blockNumber,
        averageBlockTimeSeconds: selectedChain.averageBlockTimeSeconds,
      });
      setBlockTimeResult(
        blockPointToRows(
          { number: blockNumber, timestamp: estimatedTimestamp },
          selectedChain.label,
          "未来预估",
        ),
      );
    } catch (error) {
      setBlockTimeError(
        error instanceof Error ? error.message : "区块时间查询失败",
      );
    } finally {
      setIsBlockTimeLoading(false);
    }
  };

  const lookupBlockHeight = async () => {
    setIsBlockTimeLoading(true);
    setBlockTimeError("");
    setBlockTimeResult(null);
    setCopyMessage("");

    try {
      const provider = new JsonRpcProvider(ensureRpcUrl(rpcUrl));
      const targetTimestamp = parseTargetTimeInput(targetTimeInput);
      if (!isFutureTimestamp(targetTimestamp, Math.floor(Date.now() / 1000))) {
        throw new Error("时间反查只支持未来时间；历史时间请输入区块高度查询真实时间");
      }

      const latest = await getBlockByNumber(provider, "latest");
      if (targetTimestamp <= latest.timestamp) {
        throw new Error("时间反查只用于未来时间；历史时间请输入区块高度查询真实时间");
      }

      const blockNumber = estimateFutureBlockForTimestamp({
        latestBlockNumber: latest.number,
        latestTimestamp: latest.timestamp,
        targetTimestamp,
        averageBlockTimeSeconds: selectedChain.averageBlockTimeSeconds,
      });
      setBlockTimeResult(
        blockPointToRows(
          { number: blockNumber, timestamp: targetTimestamp },
          selectedChain.label,
          "未来预估",
        ),
      );
    } catch (error) {
      setBlockTimeError(
        error instanceof Error ? error.message : "区块高度查询失败",
      );
    } finally {
      setIsBlockTimeLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">Time</h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          在秒级时间戳、北京时间和美东时间之间快速换算，方便链上开发和排查时区问题。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">时间换算</h2>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            onClick={fillCurrentTime}
          >
            获取当前时间
          </button>
        </div>

        <div className="grid gap-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              当前时间戳（秒）
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={timestampInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setTimestampInput(nextValue);
                  applyTimestamp(nextValue);
                }}
                placeholder="请输入秒级时间戳"
              />
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                onClick={() => handleCopy(timestampInput, "时间戳")}
                aria-label="复制时间戳"
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

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                北京时间
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={beijingTime}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBeijingTime(nextValue);
                    applyBeijingTime(nextValue);
                  }}
                  placeholder="YYYY-MM-DD HH:mm:ss"
                />
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(beijingTime, "北京时间")}
                  aria-label="复制北京时间"
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
                美东时间
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={easternTime}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setEasternTime(nextValue);
                    applyEasternTime(nextValue);
                  }}
                  placeholder="YYYY-MM-DD HH:mm:ss"
                />
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(easternTime, "美东时间")}
                  aria-label="复制美东时间"
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
          </div>
        </div>

        {(timestampError || beijingError || easternError) && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {timestampError || beijingError || easternError}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          输入格式固定为 <span className="font-mono">YYYY-MM-DD HH:mm:ss</span>，
          时间戳单位默认秒。
        </div>

        {copyMessage && (
          <div className="mt-3 text-xs text-slate-500">{copyMessage}</div>
        )}
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">区块时间换算</h2>
          <p className="mt-2 text-sm text-slate-600">
            历史区块直接查询链上 timestamp；未来区块和未来时间按当前配置的出块间隔预估。
          </p>
        </div>

        <div className="grid gap-6">
          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                链
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={chainKey}
                onChange={(event) =>
                  handleChainChange(event.target.value as ChainTimeKey)
                }
              >
                {Object.entries(CHAIN_TIME_CONFIGS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-slate-500">
                当前预估出块：{" "}
                <span className="font-mono text-slate-700">
                  {selectedChain.averageBlockTimeSeconds} 秒/块
                </span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                RPC URL
              </label>
              <input
                type="url"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={rpcUrl}
                onChange={(event) => {
                  setRpcUrl(event.target.value);
                  setBlockTimeError("");
                }}
                placeholder={selectedChain.defaultRpcUrl}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                当前区块高度
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 shadow-sm">
                {isLatestBlockLoading
                  ? "读取中..."
                  : latestBlockNumber || "未读取"}
              </div>
              {latestBlockError && (
                <div className="mt-2 text-xs text-rose-600">
                  {latestBlockError}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                区块高度 → 时间
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={blockHeightInput}
                  onChange={(event) => {
                    setBlockHeightInput(event.target.value);
                    setBlockTimeError("");
                  }}
                  placeholder="例如 45000000"
                />
                <button
                  type="button"
                  className="min-w-16 shrink-0 whitespace-nowrap rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={lookupBlockTime}
                  disabled={isBlockTimeLoading}
                >
                  查询
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                未来时间 → 区块高度
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={targetTimeInput}
                  onChange={(event) => {
                    setTargetTimeInput(event.target.value);
                    setBlockTimeError("");
                  }}
                  placeholder="YYYY-MM-DD HH:mm:ss 或秒级时间戳"
                />
                <button
                  type="button"
                  className="min-w-16 shrink-0 whitespace-nowrap rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={lookupBlockHeight}
                  disabled={isBlockTimeLoading || isPastTargetTime}
                >
                  反查
                </button>
              </div>
              {isPastTargetTime && (
                <div className="mt-2 text-xs text-rose-600">
                  时间反查仅支持未来时间；历史时间请通过区块高度查询真实时间。
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          默认 RPC 可直接使用，也可以替换为自己的节点；已出块高度使用链上真实时间，
          未来高度/时间才使用预估出块间隔。
        </div>

        {isBlockTimeLoading && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            正在查询链上数据...
          </div>
        )}

        {blockTimeError && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {blockTimeError}
          </div>
        )}

        {blockTimeResult && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            {blockTimeResult.rows.map((row) => (
              <div
                key={row.label}
                className="grid gap-2 border-b border-slate-100 bg-white px-4 py-3 last:border-b-0 md:grid-cols-[140px_minmax(0,1fr)_auto] md:items-center"
              >
                <div className="text-sm font-semibold text-slate-600">
                  {row.label}
                </div>
                <div className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                  {row.value}
                </div>
                {row.copyable ? (
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                    onClick={() => handleCopy(row.value, row.label)}
                    aria-label={`复制${row.label}`}
                    title={`复制${row.label}`}
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
                ) : (
                  <span className="hidden h-9 w-9 md:block" />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default TimeConverter;
