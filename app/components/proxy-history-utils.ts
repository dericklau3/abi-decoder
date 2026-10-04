import { getAddress, id } from "ethers";
import { BEACON_SLOT, IMPLEMENTATION_SLOT, ProxyMode, addressFromStorageSlot, isEmptySlot } from "./proxy-lookup-utils";

const UPGRADED = id("Upgraded(address)");
const BEACON_UPGRADED = id("BeaconUpgraded(address)");
const IMPLEMENTATION_SELECTOR = "0x5c60da1b";
const hex = (n: number) => `0x${n.toString(16)}`;

export type HistoryRow = {
  implementationAddress: string | null;
  transactionHash: string;
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  timestamp: number | null;
  sourceAddress: string;
  kind: "upgrade" | "beacon-binding";
};
export type HistoryResult = {
  rows: HistoryRow[];
  warnings: string[];
  snapshotBlock: number;
  startBlock: number;
  currentImplementation: string;
};
export type HistoryProgress = { label: string; scannedBlock: number; totalBlock: number };
export type HistoryRpc = { send: (method: string, params: unknown[]) => Promise<unknown> };
type Options = { startBlock?: number; blockRange?: number; signal?: AbortSignal; onProgress?: (progress: HistoryProgress) => void };
type UpgradeLog = { address: string; blockNumber: number; transactionIndex: number; logIndex: number; transactionHash: string; topic: string; value: string };

const quantity = (value: unknown): number => {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error("RPC 返回无效的区块或日志数据");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("RPC 返回无效的区块或日志数据");
  return n;
};
const compare = (a: UpgradeLog, b: UpgradeLog) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex;

function decodeLog(value: unknown, address: string, topics: string[], from: number, to: number): UpgradeLog | null {
  const log = value as { address?: string; topics?: string[]; removed?: boolean; blockNumber?: string; transactionIndex?: string; logIndex?: string; transactionHash?: string };
  if (!log || typeof log !== "object") throw new Error("RPC 返回无效日志");
  if (log.removed) throw new Error("查询期间发现已移除的日志，请重新查询");
  if (!log.address || log.address.toLowerCase() !== address.toLowerCase() || !Array.isArray(log.topics) || !topics.includes(log.topics[0])) throw new Error("RPC 返回与筛选条件不符的日志");
  if (!log.transactionHash || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash)) throw new Error("RPC 日志缺少有效的交易哈希");
  const blockNumber = quantity(log.blockNumber);
  if (blockNumber < from || blockNumber > to) throw new Error("RPC 返回范围之外的日志");
  return {
    address: getAddress(log.address), blockNumber,
    transactionIndex: quantity(log.transactionIndex), logIndex: quantity(log.logIndex),
    transactionHash: log.transactionHash, topic: log.topics[0], value: addressFromStorageSlot(log.topics[1] ?? ""),
  };
}

export async function queryProxyHistory(rpc: HistoryRpc, proxyAddress: string, mode: ProxyMode, options: Options = {}): Promise<HistoryResult> {
  const checkCancelled = () => { if (options.signal?.aborted) throw new Error("历史查询已取消"); };
  const send = async (method: string, params: unknown[]) => {
    checkCancelled();
    const result = await rpc.send(method, params);
    checkCancelled();
    return result;
  };
  const proxy = getAddress(proxyAddress);
  const startBlock = options.startBlock ?? 0;
  const blockRange = options.blockRange ?? 10_000;
  if (!Number.isSafeInteger(startBlock) || startBlock < 0) throw new Error("开始区块必须是非负整数");
  if (!Number.isSafeInteger(blockRange) || blockRange < 1) throw new Error("每次扫描区块数必须是正整数");
  const snapshotBlock = quantity(await send("eth_blockNumber", []));
  if (startBlock > snapshotBlock) throw new Error("开始区块不能超过最新区块");
  const totalBlock = snapshotBlock - startBlock + 1;
  const snapshot = hex(snapshotBlock);
  const warnings = new Set<string>();
  const slot = await send("eth_getStorageAt", [proxy, mode === "beacon" ? BEACON_SLOT : IMPLEMENTATION_SLOT, snapshot]);
  if (typeof slot !== "string" || isEmptySlot(slot)) throw new Error("代理 slot 为空，请确认代理类型或地址");
  const slotAddress = addressFromStorageSlot(slot);
  const readBeacon = async (address: string, block: number) => {
    const value = await send("eth_call", [{ to: address, data: IMPLEMENTATION_SELECTOR }, hex(block)]);
    if (typeof value !== "string") throw new Error("Beacon implementation() 返回无效数据");
    return addressFromStorageSlot(value);
  };
  const currentImplementation = mode === "beacon" ? await readBeacon(slotAddress, snapshotBlock) : slotAddress;

  const scan = async (address: string, topics: string[], label: string): Promise<UpgradeLog[]> => {
    const logs: UpgradeLog[] = [];
    const seen = new Set<string>();
    let from = startBlock, size = blockRange;
    while (from <= snapshotBlock) {
      const to = Math.min(snapshotBlock, from + size - 1);
      options.onProgress?.({ label, scannedBlock: from - startBlock, totalBlock });
      let values: unknown;
      try {
        values = await send("eth_getLogs", [{ address, topics: [topics.length === 1 ? topics[0] : topics], fromBlock: hex(from), toBlock: hex(to) }]);
      } catch (error) {
        checkCancelled();
        const outer = error as { error?: { message?: string }; message?: string; info?: { responseStatus?: string } };
        const message = outer?.error?.message ?? outer?.message ?? "未知 RPC 错误";
        // Generic quota and -32005 errors are not evidence of a block range limit.
        const quota = /429|too many requests|rate.?limit|quota|compute units/i.test(message + (outer?.info?.responseStatus ?? ""));
        const range = /block range|range of blocks|blocks? range|(?:limited to|maximum of|at most|up to) (?:a )?[\d,]+ blocks?|too many (?:results|logs)|response size|response too large|log response size|more than .* (?:results|logs)/i.test(message);
        if (!quota && range && size > 1) {
          const match = message.match(/(?:maximum|max)(?: allowed)? (?:block )?range(?: of)?\s*[:=]?\s*([\d,]+)/i)
            ?? message.match(/(?:limited to|maximum of|at most|up to) (?:a )?([\d,]+) blocks?/i);
          const limit = match ? Number(match[1].replaceAll(",", "")) : 0;
          size = Math.max(1, Math.min(Math.floor(size / 2), limit > 0 ? limit : size));
          continue;
        }
        throw new Error(`历史扫描未完成（${label}，区块 ${from}–${to}）：${message}`);
      }
      if (!Array.isArray(values)) throw new Error("历史扫描未完成：RPC 日志结果不是数组");
      for (const value of values) {
        const log = decodeLog(value, address, topics, from, to);
        if (!log) continue;
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (!seen.has(key)) { seen.add(key); logs.push(log); }
      }
      from = to + 1;
      options.onProgress?.({ label, scannedBlock: from - startBlock, totalBlock });
    }
    return logs.sort(compare);
  };

  const proxyLogs = await scan(proxy, [UPGRADED, BEACON_UPGRADED], "Proxy 升级事件");
  const entries: { log: UpgradeLog; implementation: string | null; kind: HistoryRow["kind"] }[] =
    proxyLogs.filter(log => log.topic === UPGRADED).map(log => ({ log, implementation: log.value, kind: "upgrade" }));

  const bindings = proxyLogs.filter(log => log.topic === BEACON_UPGRADED);
  // Determine an already-active beacon without scanning before the chosen range.
  // This boundary is for filtering only; it is never presented as an invented tx.
  let initialBinding: UpgradeLog | null = null;
  if (startBlock > 0) {
    try {
      const previousBlock = hex(startBlock - 1);
      const directSlot = await send("eth_getStorageAt", [proxy, IMPLEMENTATION_SLOT, previousBlock]);
      if (typeof directSlot !== "string") throw new Error("历史 slot 无效");
      if (isEmptySlot(directSlot)) {
        const previousBeacon = await send("eth_getStorageAt", [proxy, BEACON_SLOT, previousBlock]);
        if (typeof previousBeacon !== "string") throw new Error("历史 slot 无效");
        if (!isEmptySlot(previousBeacon)) initialBinding = {
          address: proxy, blockNumber: startBlock - 1, transactionIndex: Number.MAX_SAFE_INTEGER,
          logIndex: Number.MAX_SAFE_INTEGER, transactionHash: "", topic: BEACON_UPGRADED,
          value: addressFromStorageSlot(previousBeacon),
        };
      }
    } catch {
      checkCancelled();
      warnings.add("开始区块之前的代理状态读取失败；无法确认此前绑定的 Beacon，相关升级历史可能缺失。请使用支持历史状态的 RPC 或从部署区块扫描。");
    }
  }
  const periods = initialBinding ? [initialBinding, ...bindings] : bindings;
  if (mode === "beacon" || periods.length) {
    const beaconLogs = new Map<string, UpgradeLog[]>();
    for (const address of new Set(periods.map(log => log.value))) {
      beaconLogs.set(address, await scan(address, [UPGRADED], `Beacon ${address}`));
    }
    if (!periods.length) {
      warnings.add("未找到 Beacon 绑定事件，无法确定代理开始使用当前 Beacon 的时间；未将 Beacon 的全部历史当作该代理的历史。");
    }
    for (const binding of periods) {
      const next = proxyLogs.find(log => compare(log, binding) > 0);
      const upgrades = beaconLogs.get(binding.value)!;
      const prior = upgrades.filter(log => compare(log, binding) <= 0).at(-1);
      let implementation: string | null = prior?.value ?? null;
      if (binding !== initialBinding && !implementation) {
        // A block-end eth_call cannot establish state at a transaction/log boundary.
        // Use the preceding block only when there is no same-block beacon upgrade.
        if (binding.blockNumber > 0 && !upgrades.some(log => log.blockNumber === binding.blockNumber)) {
          try { implementation = await readBeacon(binding.value, binding.blockNumber - 1); }
          catch { checkCancelled(); }
        }
        warnings.add(`Beacon ${binding.value} 缺少初始升级事件；绑定时的实现${implementation ? "根据前一区块状态读取，无法验证同区块内未发事件的变更" : "无法确认（可能需要历史状态 RPC）"}。`);
      }
      if (binding !== initialBinding) entries.push({ log: binding, implementation, kind: "beacon-binding" });
      for (const log of upgrades) {
        if (compare(log, binding) > 0 && (!next || compare(log, next) < 0)) entries.push({ log, implementation: log.value, kind: "upgrade" });
      }
    }
    if (mode === "beacon" && bindings.length && bindings.at(-1)!.value !== slotAddress) warnings.add("当前 Beacon 与最后一次绑定事件不一致，历史记录可能缺失。");
  }
  entries.sort((a, b) => compare(b.log, a.log));
  if (!entries.length) warnings.add("未找到标准升级事件，无法据此还原实现历史。");
  else if (entries[0].implementation !== currentImplementation) warnings.add("最后一条历史记录与当前 Impl 不一致，可能存在未发出标准事件的变更或历史日志缺失。");

  const timestamps = new Map<number, number | null>();
  const rows: HistoryRow[] = [];
  for (const entry of entries) {
    const log = entry.log;
    if (!timestamps.has(log.blockNumber)) {
      options.onProgress?.({ label: "读取升级区块时间", scannedBlock: totalBlock, totalBlock });
      try {
        const block = await send("eth_getBlockByNumber", [hex(log.blockNumber), false]) as { timestamp?: string } | null;
        timestamps.set(log.blockNumber, quantity(block?.timestamp));
      } catch {
        checkCancelled();
        timestamps.set(log.blockNumber, null);
        warnings.add(`区块 ${log.blockNumber} 的时间读取失败；地址和交易哈希仍予保留。`);
      }
    }
    rows.push({ implementationAddress: entry.implementation, transactionHash: log.transactionHash,
      blockNumber: log.blockNumber, transactionIndex: log.transactionIndex, logIndex: log.logIndex,
      timestamp: timestamps.get(log.blockNumber) ?? null, sourceAddress: log.address, kind: entry.kind });
  }
  return { rows, warnings: [...warnings], startBlock, snapshotBlock, currentImplementation };
}
