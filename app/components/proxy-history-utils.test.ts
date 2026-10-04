import { describe, expect, test } from "bun:test";
import { id } from "ethers";
import { queryProxyHistory } from "./proxy-history-utils";
import { BEACON_SLOT } from "./proxy-lookup-utils";

const proxy = "0x0000000000000000000000000000000000000001";
const beaconA = "0x0000000000000000000000000000000000000002";
const beaconB = "0x0000000000000000000000000000000000000003";
const implA = "0x0000000000000000000000000000000000000011";
const implB = "0x0000000000000000000000000000000000000012";
const word = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;
const hex = (n: number) => `0x${n.toString(16)}`;
const event = (address: string, block: number, index: number, value: string, name = "Upgraded") => ({
  address, blockNumber: hex(block), transactionIndex: "0x0", logIndex: hex(index),
  transactionHash: `0x${(block * 100 + index).toString(16).padStart(64, "0")}`,
  blockHash: `0x${block.toString(16).padStart(64, "0")}`, data: "0x",
  topics: [id(`${name}(address)`), word(value)], removed: false,
});

function rpc(logs: ReturnType<typeof event>[], options: { limit?: number; fail?: string; current?: string; beacon?: string; noBlocks?: boolean; callFails?: boolean } = {}) {
  return { send: async (method: string, params: unknown[]): Promise<unknown> => {
    if (method === "eth_blockNumber") return "0xa";
    if (method === "eth_getStorageAt") return word(params[1] === BEACON_SLOT ? options.beacon ?? beaconB : options.current ?? implB);
    if (method === "eth_call") {
      if (options.callFails && params[1] !== "0xa") throw new Error("historical state unavailable");
      return word(options.current ?? implB);
    }
    if (method === "eth_getBlockByNumber") return options.noBlocks ? null : { timestamp: "0x6553f100" };
    if (method === "eth_getLogs") {
      if (options.fail) throw new Error(options.fail);
      const filter = params[0] as { address: string; fromBlock: string; toBlock: string; topics: [string | string[]] };
      const from = Number(filter.fromBlock), to = Number(filter.toBlock);
      if (options.limit && to - from + 1 > options.limit) throw new Error(`maximum block range ${options.limit}`);
      const topics = Array.isArray(filter.topics[0]) ? filter.topics[0] : [filter.topics[0]];
      return logs.filter(log => log.address === filter.address && Number(log.blockNumber) >= from && Number(log.blockNumber) <= to && topics.includes(log.topics[0])).reverse();
    }
    throw new Error(`Unexpected method: ${method}`);
  }};
}

describe("proxy implementation history", () => {
  test("keeps initialization and repeated implementation uses, sorted by block and log", async () => {
    const result = await queryProxyHistory(rpc([
      event(proxy, 2, 0, implA), event(proxy, 5, 0, implB), event(proxy, 5, 1, implA),
    ], { current: implA, limit: 3 }), proxy, "erc1967");
    expect(result.rows.map(row => row.implementationAddress)).toEqual([implA, implB, implA]);
    expect(result.rows.map(row => row.blockNumber)).toEqual([5, 5, 2]);
    expect(result.rows[0].timestamp).toBe(1700000000);
    expect(result.rows[0].transactionHash).toBe(`0x${(501).toString(16).padStart(64, "0")}`);
  });

  test("does not convert quota errors into range retries or an empty successful history", async () => {
    await expect(queryProxyHistory(rpc([], { fail: "-32005: limit exceeded" }), proxy, "erc1967")).rejects.toThrow("limit exceeded");
  });

  test("follows beacon bindings and excludes upgrades outside each binding, including same-block boundaries", async () => {
    const result = await queryProxyHistory(rpc([
      event(beaconA, 1, 0, implA),
      event(proxy, 2, 0, beaconA, "BeaconUpgraded"),
      event(beaconA, 3, 0, implB),
      event(beaconB, 1, 0, implA),
      event(proxy, 5, 1, beaconB, "BeaconUpgraded"),
      event(beaconA, 5, 2, implA), // already detached
      event(beaconB, 5, 2, implB), // upgrade after attachment
    ]), proxy, "beacon");
    expect(result.rows.map(row => [row.blockNumber, row.implementationAddress, row.sourceAddress])).toEqual([
      [5, implB, beaconB], [5, implA, proxy], [3, implB, beaconA], [2, implA, proxy],
    ]);
    expect(result.warnings).toEqual([]);
  });

  test("warns when the current implementation has no matching upgrade event", async () => {
    const result = await queryProxyHistory(rpc([event(proxy, 2, 0, implA)]), proxy, "erc1967");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(1);
  });

  test("keeps hashes and addresses when a block timestamp is unavailable", async () => {
    const result = await queryProxyHistory(rpc([event(proxy, 2, 0, implB)], { noBlocks: true }), proxy, "erc1967");
    expect(result.rows[0].timestamp).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("does not invent a beacon's initial implementation when archive calls fail", async () => {
    const result = await queryProxyHistory(rpc([
      event(proxy, 2, 0, beaconB, "BeaconUpgraded"), event(beaconB, 4, 0, implB),
    ], { callFails: true }), proxy, "beacon");
    expect(result.rows.find(row => row.blockNumber === 2)?.implementationAddress).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("honors cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(queryProxyHistory(rpc([]), proxy, "erc1967", { signal: controller.signal })).rejects.toThrow("已取消");
  });

  test("includes former beacon implementations when the proxy now uses a direct implementation", async () => {
    const result = await queryProxyHistory(rpc([
      event(beaconA, 1, 0, implA), event(proxy, 2, 0, beaconA, "BeaconUpgraded"),
      event(beaconA, 3, 0, implB), event(proxy, 5, 0, implA), event(beaconA, 6, 0, implB),
    ], { current: implA }), proxy, "erc1967");
    expect(result.rows.map(row => [row.blockNumber, row.implementationAddress])).toEqual([
      [5, implA], [3, implB], [2, implA],
    ]);
  });

  test("does not use block-end beacon state for a binding before a same-block upgrade", async () => {
    const result = await queryProxyHistory(rpc([
      event(proxy, 2, 0, beaconB, "BeaconUpgraded"), event(beaconB, 2, 1, implB),
    ]), proxy, "beacon");
    expect(result.rows[1].implementationAddress).toBeNull();
  });

  test("scans only the selected range and never exceeds the requested batch size", async () => {
    const base = rpc([event(proxy, 2, 0, implA), event(proxy, 7, 0, implB)]);
    const ranges: [number, number][] = [];
    const result = await queryProxyHistory({ send: async (method, params) => {
      if (method === "eth_getLogs") {
        const filter = params[0] as { fromBlock: string; toBlock: string };
        ranges.push([Number(filter.fromBlock), Number(filter.toBlock)]);
      }
      return base.send(method, params);
    } }, proxy, "erc1967", { startBlock: 5, blockRange: 2 });
    expect(ranges).toEqual([[5, 6], [7, 8], [9, 10]]);
    expect(result.rows.map(row => row.blockNumber)).toEqual([7]);
    expect(result.startBlock).toBe(5);
  });

  test("rejects invalid start blocks and batch sizes", async () => {
    for (const options of [{ startBlock: -1 }, { startBlock: 11 }, { blockRange: 0 }, { blockRange: 1.5 }]) {
      await expect(queryProxyHistory(rpc([]), proxy, "erc1967", options)).rejects.toThrow();
    }
  });

  test("includes in-range upgrades of a beacon attached before the start block", async () => {
    const base = rpc([event(beaconB, 2, 0, implA), event(beaconB, 7, 0, implB)]);
    const result = await queryProxyHistory({ send: async (method, params) => {
      if (method === "eth_getStorageAt" && params[2] === "0x4") return word(params[1] === BEACON_SLOT ? beaconB : "0x0000000000000000000000000000000000000000");
      return base.send(method, params);
    } }, proxy, "beacon", { startBlock: 5, blockRange: 2 });
    expect(result.rows.map(row => [row.blockNumber, row.implementationAddress])).toEqual([[7, implB]]);
    expect(result.warnings).toEqual([]);
  });
});
