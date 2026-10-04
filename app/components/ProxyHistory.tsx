"use client";

import { useEffect, useRef, useState } from "react";
import { FetchRequest, JsonRpcProvider } from "ethers";
import { normalizeRpcUrl } from "./rpc-check-utils";
import { normalizeAddressInput, ProxyMode } from "./proxy-lookup-utils";
import { HistoryProgress, HistoryResult, queryProxyHistory } from "./proxy-history-utils";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const PAGE_SIZE = 20;
type ActiveRequest = { controller: AbortController; provider: JsonRpcProvider };

export default function ProxyHistory({ rpcUrl, proxyInput, mode, onCopy, copyMessage }: {
  rpcUrl: string; proxyInput: string; mode: ProxyMode;
  onCopy: (value: string, label: string) => void; copyMessage: string;
}) {
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [progress, setProgress] = useState<HistoryProgress | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [startBlock, setStartBlock] = useState("0");
  const [blockRange, setBlockRange] = useState("10000");
  const active = useRef<ActiveRequest | null>(null);

  useEffect(() => {
    setResult(null); setError(""); setProgress(null); setIsLoading(false); setPage(0);
    return () => {
      active.current?.controller.abort();
      active.current?.provider.destroy();
      active.current = null;
    };
  }, [rpcUrl, proxyInput, mode, startBlock, blockRange]);

  const cancel = () => {
    active.current?.controller.abort();
    active.current?.provider.destroy();
    active.current = null;
    setIsLoading(false);
    setProgress(null);
    setError("历史查询已取消，扫描未完成。");
  };

  const query = async () => {
    if (active.current) return;
    setResult(null); setError(""); setProgress(null); setPage(0);
    let request: ActiveRequest | null = null;
    try {
      const url = normalizeRpcUrl(rpcUrl);
      const address = normalizeAddressInput(proxyInput);
      if (!address) throw new Error("请输入 Proxy 地址");
      if (!/^\d+$/.test(startBlock.trim())) throw new Error("开始区块必须是非负整数");
      if (!/^\d+$/.test(blockRange.trim())) throw new Error("每次扫描区块数必须是正整数");
      const fetch = new FetchRequest(url);
      fetch.timeout = 15_000;
      const provider = new JsonRpcProvider(fetch, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
      request = { controller: new AbortController(), provider };
      active.current = request;
      setIsLoading(true);
      const history = await queryProxyHistory(provider, address, mode, {
        startBlock: Number(startBlock), blockRange: Number(blockRange),
        signal: request.controller.signal,
        onProgress: value => { if (active.current === request) setProgress(value); },
      });
      if (active.current === request) setResult(history);
    } catch (cause) {
      if (!request || active.current === request) {
        setError(cause instanceof Error ? cause.message : "历史查询未完成，请检查 RPC 和地址");
      }
    } finally {
      request?.provider.destroy();
      if (active.current === request) {
        active.current = null;
        setIsLoading(false);
        setProgress(null);
      }
    }
  };

  const percent = progress ? Math.floor(progress.scannedBlock / progress.totalBlock * 100) : 0;
  const pages = Math.max(1, Math.ceil((result?.rows.length ?? 0) / PAGE_SIZE));
  const normalizedProxy = `0x${proxyInput.trim().replace(/^0x/i, "")}`.toLowerCase();
  const copyCell = (value: string, label: string) => (
    <button type="button" onClick={() => onCopy(value, label)} title={`点击复制${label}`} aria-label={`复制${label} ${value}`}
      className="break-all text-left font-mono text-xs text-slate-700 transition hover:text-blue-700 focus-visible:outline-blue-500">
      {value}
    </button>
  );

  return (
    <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Impl 历史</h2>
          <p className="mt-1 text-sm text-slate-500">使用上方 RPC、Proxy 地址和代理类型，查询部署初始化及历次实现变更。</p>
        </div>
        <button type="button" onClick={isLoading ? cancel : query}
          className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          {isLoading ? "取消查询" : "查询 Impl 历史"}
        </button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="proxy-history-start" className="mb-2 block text-sm font-medium text-slate-700">开始区块</label>
          <input id="proxy-history-start" type="text" inputMode="numeric" value={startBlock} disabled={isLoading}
            onChange={event => setStartBlock(event.target.value)} placeholder="例如代理部署区块号"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none disabled:bg-slate-50" />
          <p className="mt-1 text-xs text-slate-500">从此区块扫描到查询时的最新区块，包含开始区块。</p>
        </div>
        <div>
          <label htmlFor="proxy-history-range" className="mb-2 block text-sm font-medium text-slate-700">每次扫描区块数</label>
          <input id="proxy-history-range" type="text" inputMode="numeric" value={blockRange} disabled={isLoading}
            onChange={event => setBlockRange(event.target.value)} placeholder="10000"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none disabled:bg-slate-50" />
          <p className="mt-1 text-xs text-slate-500">按 RPC 支持的范围设置；明确超限时自动缩小。</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        按标准 Upgraded / BeaconUpgraded 事件还原，保留同一 Impl 的重复使用记录。Beacon 升级仅计入代理绑定期间。
        RPC 需支持历史 eth_getLogs；缺少初始事件时，可能需要历史状态读取。未发出标准事件的变更无法保证覆盖。
      </p>
      <div aria-live="polite" role="status">
        {isLoading && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="break-all">{progress?.label ?? "连接 RPC 并读取当前实现…"}</p>
          {progress && <>
            <p className="mt-1">本轮扫描 {percent}% · {progress.scannedBlock.toLocaleString()} / {progress.totalBlock.toLocaleString()} 个区块</p>
            <progress className="mt-2 h-2 w-full accent-slate-900" value={progress.scannedBlock} max={progress.totalBlock} aria-label="本轮历史扫描进度" />
          </>}
        </div>}
        {error && <div className="mt-4 break-words rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      </div>
      {result && <>
        <div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p>已扫描区块 {result.startBlock.toLocaleString()}–{result.snapshotBlock.toLocaleString()} · {result.rows.length} 条记录 · 时间为 UTC+8</p>
          <p className="flex flex-wrap items-center gap-2">当前 Impl：{copyCell(result.currentImplementation, "当前 Impl 地址")}</p>
        </div>
        {result.warnings.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">历史信息存在缺失</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{result.warnings.map(warning => <li className="break-words" key={warning}>{warning}</li>)}</ul>
        </div>}
        {result.rows.length === 0 ? <p className="mt-5 text-sm text-slate-500">未找到可展示的标准实现变更记录。</p> :
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[900px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>
                <th scope="col" className="w-[170px] px-4 py-3">生效时间（UTC+8）</th>
                <th scope="col" className="w-[140px] px-4 py-3">区块 / 事件</th>
                <th scope="col" className="px-4 py-3">Impl 地址</th>
                <th scope="col" className="px-4 py-3">TxHash</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{result.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => (
                <tr key={`${row.sourceAddress}:${row.transactionHash}:${row.logIndex}`} className="align-top">
                  <td className="px-4 py-4 text-xs leading-5 text-slate-600">{row.timestamp === null ? "时间读取失败" : timeFormatter.format(new Date(row.timestamp * 1000))}</td>
                  <td className="px-4 py-4 text-xs leading-5 text-slate-600">
                    <p>{row.blockNumber.toLocaleString()}</p>
                    <p>{row.kind === "beacon-binding" ? "Beacon 绑定" : "Impl 设置 / 升级"}</p>
                    <p>日志 #{row.logIndex}</p>
                    {row.sourceAddress.toLowerCase() !== normalizedProxy && row.kind === "upgrade" && <p className="mt-1 break-all" title={row.sourceAddress}>Beacon：{row.sourceAddress}</p>}
                  </td>
                  <td className="px-4 py-4">{row.implementationAddress ? copyCell(row.implementationAddress, "Impl 地址") : <span className="text-xs text-amber-700">绑定时的 Impl 无法确认</span>}</td>
                  <td className="px-4 py-4">{copyCell(row.transactionHash, "TxHash")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
        {pages > 1 && <div className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-600">
          <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">上一页</button>
          <span>{page + 1} / {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">下一页</button>
        </div>}
        <p className="mt-3 text-xs text-slate-500">点击地址或 TxHash 即可复制。{copyMessage}</p>
      </>}
    </section>
  );
}
