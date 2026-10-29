import { connect, createConfig, createConnector, disconnect, getAccount, getConnectorClient, http } from "@wagmi/core";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "bun:test";
import { createWalletProvider, getWalletNetwork } from "./wallet-network";

describe("wallet networks", () => {
  test("unknown networks keep their actual chain ID without assuming ETH", () => {
    expect(getWalletNetwork(123456789)).toEqual({ chainId: 123456789, name: "Chain #123456789", symbol: "原生币" });
    expect(getWalletNetwork(5042002, { id: 5042002, name: "Arc Testnet", nativeCurrency: { symbol: "USDC" } }).symbol).toBe("USDC");
    expect(getWalletNetwork(123, { id: 1, name: "Ethereum", nativeCurrency: { symbol: "ETH" } }).name).toBe("Chain #123");
  });

  test("reads and signs on the wallet's unlisted network", async () => {
    const requests: string[] = [];
    const transport = { request: async ({ method }: { method: string }) => {
      requests.push(method);
      if (method === "eth_chainId") return "0x75bcd15";
      if (method === "eth_call") return "0x" + "0".repeat(63) + "7";
      if (method === "eth_accounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "personal_sign") return "0x1234";
      throw new Error(method);
    } };
    const provider = createWalletProvider(transport, getWalletNetwork(123456789));
    expect((await provider.getNetwork()).chainId).toBe(123456789n);
    expect(BigInt(await provider.call({ to: "0x0000000000000000000000000000000000000002", data: "0x12345678" }))).toBe(7n);
    expect(await (await provider.getSigner()).signMessage("test")).toBe("0x1234");
    expect(requests).not.toContain("wallet_switchEthereumChain");
  });
});

test("wagmi keeps an unlisted wallet chain through connect, switch and disconnect", async () => {
  let walletChainId = 123456789;
  const connector = createConnector((config) => ({
    id: "test-wallet", name: "Test wallet", type: "mock",
    async connect() { return { accounts: ["0x0000000000000000000000000000000000000001" as const], chainId: walletChainId }; },
    async disconnect() {},
    async getAccounts() { return ["0x0000000000000000000000000000000000000001" as const]; },
    async getChainId() { return walletChainId; },
    async getProvider() { return { request: async () => `0x${walletChainId.toString(16)}` }; },
    async isAuthorized() { return true; },
    onAccountsChanged() {}, onDisconnect() {},
    onChainChanged(chainId) { walletChainId = Number(chainId); config.emitter.emit("change", { chainId: walletChainId }); },
  }));
  const config = createConfig({ chains: [mainnet], connectors: [connector], transports: { [mainnet.id]: http() }, storage: null });
  await connect(config, { connector: config.connectors[0] });
  expect(getAccount(config).chainId).toBe(123456789);
  const client = await getConnectorClient(config, { chainId: 123456789 });
  expect(client.chain).toBeUndefined();
  expect((await createWalletProvider(client.transport, getWalletNetwork(123456789)).getNetwork()).chainId).toBe(123456789n);
  config.connectors[0].onChainChanged("0x12345");
  expect(getAccount(config).chainId).toBe(74565);
  const switched = await getConnectorClient(config, { chainId: 74565 });
  expect((await createWalletProvider(switched.transport, getWalletNetwork(74565)).getNetwork()).chainId).toBe(74565n);
  await disconnect(config);
  expect(getAccount(config).isConnected).toBe(false);
});
