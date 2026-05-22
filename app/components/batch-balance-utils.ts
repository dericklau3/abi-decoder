import { getAddress } from "ethers";

export const parseBalanceAddressInput = (value: string) => {
  const rawAddresses = value
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (rawAddresses.length === 0) {
    throw new Error("请至少输入一个 EVM 地址");
  }

  const seen = new Set<string>();
  const addresses: string[] = [];

  rawAddresses.forEach((rawAddress, index) => {
    let checksummedAddress = "";
    try {
      checksummedAddress = getAddress(
        rawAddress.startsWith("0x") ? rawAddress : `0x${rawAddress}`,
      );
    } catch {
      throw new Error(`第 ${index + 1} 个地址格式无效`);
    }

    const dedupeKey = checksummedAddress.toLowerCase();
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      addresses.push(checksummedAddress);
    }
  });

  return addresses;
};
