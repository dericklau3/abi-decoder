import { formatUnits, getAddress } from "ethers";

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

export const normalizeErc20TokenAddress = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入 ERC20 合约地址");
  }

  try {
    return getAddress(trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`);
  } catch {
    throw new Error("请输入有效的 ERC20 合约地址");
  }
};

export const formatTokenBalance = (balance: bigint, decimals: number) => {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    return balance.toString();
  }

  try {
    return formatUnits(balance, decimals);
  } catch {
    return balance.toString();
  }
};
