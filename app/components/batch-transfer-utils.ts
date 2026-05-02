import { getAddress, parseUnits } from "ethers";

export type BatchTransferAssetType = "eth" | "erc20" | "erc721";
export type BatchTransferAmountMode = "equal" | "varied";

type BuildBatchTransferRequestInput = {
  assetType: BatchTransferAssetType;
  amountMode: BatchTransferAmountMode;
  receiversText: string;
  singleAmountText: string;
  amountsText: string;
  tokenAddressText: string;
  decimals: number;
};

export type BatchTransferRequest = {
  method:
    | "batchTransferEth(address[],uint256)"
    | "batchTransferEth(address[],uint256[])"
    | "batchTransferErc20(address,address[],uint256)"
    | "batchTransferErc20(address,address[],uint256[])"
    | "batchTransferErc721(address,address[],uint256[])";
  args: unknown[];
  value: bigint;
  summary: {
    receiverCount: number;
    totalAmount: bigint;
  };
};

export type TokenApprovalRequest = {
  method: "approve(address,uint256)" | "setApprovalForAll(address,bool)";
  args: unknown[];
};

const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const parseNonEmptyLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const assertDecimals = (decimals: number) => {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("精度需要是 0 到 18 之间的整数");
  }
};

export const parseAddressLines = (value: string) =>
  parseNonEmptyLines(value).map((line) => getAddress(normalizeAddressInput(line)));

export const parseAmountLines = (value: string, decimals: number) => {
  assertDecimals(decimals);
  return parseNonEmptyLines(value).map((line) => parseUnits(line, decimals));
};

const sumValues = (values: bigint[]) =>
  values.reduce((total, item) => total + item, BigInt(0));

export const buildBatchTransferRequest = ({
  assetType,
  amountMode,
  receiversText,
  singleAmountText,
  amountsText,
  tokenAddressText,
  decimals,
}: BuildBatchTransferRequestInput): BatchTransferRequest => {
  const receivers = parseAddressLines(receiversText);
  if (receivers.length === 0) {
    throw new Error("请至少填写一个收款地址");
  }

  if (assetType === "erc721") {
    const tokenAddress = getAddress(normalizeAddressInput(tokenAddressText));
    const tokenIds = parseAmountLines(amountsText, 0);
    if (tokenIds.length !== receivers.length) {
      throw new Error("收款地址数量需要和 tokenId 数量一致");
    }
    return {
      method: "batchTransferErc721(address,address[],uint256[])",
      args: [tokenAddress, receivers, tokenIds],
      value: BigInt(0),
      summary: {
        receiverCount: receivers.length,
        totalAmount: BigInt(tokenIds.length),
      },
    };
  }

  const tokenAddress =
    assetType === "erc20" ? getAddress(normalizeAddressInput(tokenAddressText)) : "";

  if (amountMode === "equal") {
    const amount = parseUnits(singleAmountText.trim(), decimals);
    const totalAmount = amount * BigInt(receivers.length);
    return {
      method:
        assetType === "eth"
          ? "batchTransferEth(address[],uint256)"
          : "batchTransferErc20(address,address[],uint256)",
      args:
        assetType === "eth" ? [receivers, amount] : [tokenAddress, receivers, amount],
      value: assetType === "eth" ? totalAmount : BigInt(0),
      summary: {
        receiverCount: receivers.length,
        totalAmount,
      },
    };
  }

  const amounts = parseAmountLines(amountsText, decimals);
  if (amounts.length !== receivers.length) {
    throw new Error("收款地址数量需要和金额数量一致");
  }

  const totalAmount = sumValues(amounts);
  return {
    method:
      assetType === "eth"
        ? "batchTransferEth(address[],uint256[])"
        : "batchTransferErc20(address,address[],uint256[])",
    args: assetType === "eth" ? [receivers, amounts] : [tokenAddress, receivers, amounts],
    value: assetType === "eth" ? totalAmount : BigInt(0),
    summary: {
      receiverCount: receivers.length,
      totalAmount,
    },
  };
};

export const buildTokenApprovalRequest = (
  assetType: BatchTransferAssetType,
  spenderAddress: string,
): TokenApprovalRequest | null => {
  if (assetType === "eth") {
    return null;
  }

  const spender = getAddress(normalizeAddressInput(spenderAddress));
  if (assetType === "erc20") {
    return {
      method: "approve(address,uint256)",
      args: [spender, MAX_UINT256],
    };
  }

  return {
    method: "setApprovalForAll(address,bool)",
    args: [spender, true],
  };
};
