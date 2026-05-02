"use client";

import { useEffect, useMemo, useState } from "react";
import { Contract, formatUnits, getAddress } from "ethers";
import { useWallet } from "./wallet/WalletProvider";
import {
  BatchTransferAmountMode,
  BatchTransferAssetType,
  buildTokenApprovalRequest,
  buildBatchTransferRequest,
} from "./batch-transfer-utils";
import { extractContractErrorMessage } from "./contract-interaction-utils";

const BATCH_TRANSFER_ADDRESS = "0x3b94A2aCAB8544B5d6cc11C0E18dAE2Df845E74A";
const BSC_TESTNET_CHAIN_ID = 97;

const BATCH_TRANSFER_ABI = [
  "function batchTransferEth(address[] receivers,uint256 amount) payable",
  "function batchTransferEth(address[] receivers,uint256[] amounts) payable",
  "function batchTransferErc20(address token,address[] receivers,uint256 amount)",
  "function batchTransferErc20(address token,address[] receivers,uint256[] amounts)",
  "function batchTransferErc721(address token,address[] receivers,uint256[] tokenIds)",
];

const ERC20_APPROVAL_ABI = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
];

const ERC721_APPROVAL_ABI = [
  "function isApprovedForAll(address owner,address operator) view returns (bool)",
  "function setApprovalForAll(address operator,bool approved)",
];

const ASSET_OPTIONS: Array<{ label: string; value: BatchTransferAssetType }> = [
  { label: "ETH", value: "eth" },
  { label: "ERC20", value: "erc20" },
  { label: "ERC721", value: "erc721" },
];

const shortAddress = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

const formatBigintValue = (value: bigint, decimals: number) => {
  try {
    return formatUnits(value, decimals);
  } catch {
    return value.toString();
  }
};

type ApprovalStatus = "idle" | "checking" | "approved" | "not-approved";

const BatchTransfer = () => {
  const { provider, injected, account, networkName, chainId, openWalletModal } =
    useWallet();
  const [assetType, setAssetType] = useState<BatchTransferAssetType>("eth");
  const [amountMode, setAmountMode] = useState<BatchTransferAmountMode>("equal");
  const [tokenAddress, setTokenAddress] = useState("");
  const [decimals, setDecimals] = useState("18");
  const [receiversText, setReceiversText] = useState("");
  const [singleAmount, setSingleAmount] = useState("");
  const [amountsText, setAmountsText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [approvalHash, setApprovalHash] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("idle");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const parsedDecimals = assetType === "erc721" ? 0 : Number(decimals);
  const effectiveAmountMode = assetType === "erc721" ? "varied" : amountMode;

  const preview = useMemo(() => {
    try {
      const request = buildBatchTransferRequest({
        assetType,
        amountMode: effectiveAmountMode,
        receiversText,
        singleAmountText: singleAmount,
        amountsText,
        tokenAddressText: tokenAddress,
        decimals: parsedDecimals,
      });
      return { request, error: "" };
    } catch (error) {
      return {
        request: null,
        error: error instanceof Error ? error.message : "参数解析失败",
      };
    }
  }, [
    assetType,
    effectiveAmountMode,
    receiversText,
    singleAmount,
    amountsText,
    tokenAddress,
    parsedDecimals,
  ]);

  const handleAssetTypeChange = (nextType: BatchTransferAssetType) => {
    setAssetType(nextType);
    setErrorMessage("");
    setTxHash("");
    setApprovalHash("");
    setApprovalMessage("");
    setApprovalStatus("idle");
    if (nextType === "erc721") {
      setAmountMode("varied");
      setDecimals("0");
    } else if (assetType === "erc721") {
      setDecimals("18");
    }
  };

  useEffect(() => {
    let isCanceled = false;

    const checkApproval = async () => {
      setApprovalHash("");
      setApprovalMessage("");
      if (assetType === "eth") {
        setApprovalStatus("approved");
        return;
      }
      if (!provider || !account || !preview.request) {
        setApprovalStatus("idle");
        return;
      }

      let checksummedToken = "";
      try {
        checksummedToken = getAddress(tokenAddress.trim());
      } catch {
        setApprovalStatus("idle");
        return;
      }

      try {
        setApprovalStatus("checking");
        const tokenCode = await provider.getCode(checksummedToken);
        if (tokenCode === "0x") {
          throw new Error("当前链上未找到 Token 合约，请检查 Token 地址与钱包网络");
        }
        const token = new Contract(
          checksummedToken,
          assetType === "erc20" ? ERC20_APPROVAL_ABI : ERC721_APPROVAL_ABI,
          provider,
        );
        const approved =
          assetType === "erc20"
            ? ((await token.allowance(
                account,
                BATCH_TRANSFER_ADDRESS,
              )) as bigint) >= preview.request.summary.totalAmount
            : Boolean(await token.isApprovedForAll(account, BATCH_TRANSFER_ADDRESS));
        if (!isCanceled) {
          setApprovalStatus(approved ? "approved" : "not-approved");
          setApprovalMessage(
            approved ? "授权状态正常，可以发起批量转账" : "需要先授权 BatchTransfer 合约",
          );
        }
      } catch (error) {
        if (!isCanceled) {
          setApprovalStatus("idle");
          setApprovalMessage("授权检查失败：" + extractContractErrorMessage(error));
        }
      }
    };

    checkApproval();

    return () => {
      isCanceled = true;
    };
  }, [account, assetType, provider, preview.request, tokenAddress]);

  const handleApprove = async () => {
    setErrorMessage("");
    setTxHash("");
    setApprovalHash("");
    setApprovalMessage("");
    setCopyMessage("");
    if (!provider) {
      setErrorMessage("请先连接钱包");
      openWalletModal();
      return;
    }
    if (assetType === "eth") {
      setApprovalStatus("approved");
      return;
    }

    let checksummedToken = "";
    try {
      checksummedToken = getAddress(tokenAddress.trim());
    } catch {
      setErrorMessage("请输入有效的 Token 合约地址");
      return;
    }

    const approvalRequest = buildTokenApprovalRequest(
      assetType,
      BATCH_TRANSFER_ADDRESS,
    );
    if (!approvalRequest) {
      return;
    }

    try {
      setIsApproving(true);
      if (typeof injected?.request === "function") {
        await injected.request({ method: "eth_requestAccounts" });
      }
      const tokenCode = await provider.getCode(checksummedToken);
      if (tokenCode === "0x") {
        throw new Error("当前链上未找到 Token 合约，请检查 Token 地址与钱包网络");
      }
      const signer = await provider.getSigner();
      const token = new Contract(
        checksummedToken,
        assetType === "erc20" ? ERC20_APPROVAL_ABI : ERC721_APPROVAL_ABI,
        signer,
      );
      const fn = token.getFunction(approvalRequest.method);
      const tx = await fn(...approvalRequest.args);
      setApprovalHash(tx.hash);
      setApprovalMessage("授权交易已发送，等待链上确认...");
      await tx.wait();
      setApprovalStatus("approved");
      setApprovalMessage("授权已确认，可以发起批量转账");
    } catch (error) {
      setApprovalStatus("not-approved");
      setApprovalMessage("授权失败：" + extractContractErrorMessage(error));
    } finally {
      setIsApproving(false);
    }
  };

  const handleCopyContract = async () => {
    try {
      await navigator.clipboard.writeText(BATCH_TRANSFER_ADDRESS);
      setCopyMessage("合约地址已复制");
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  const handleSend = async () => {
    setErrorMessage("");
    setTxHash("");
    setCopyMessage("");
    if (!provider) {
      setErrorMessage("请先连接钱包");
      openWalletModal();
      return;
    }
    if (!preview.request) {
      setErrorMessage(preview.error || "请先填写有效参数");
      return;
    }
    if (assetType !== "eth" && approvalStatus !== "approved") {
      setErrorMessage("请先完成 Token 授权，再发起批量转账");
      return;
    }

    try {
      setIsSending(true);
      if (typeof injected?.request === "function") {
        await injected.request({ method: "eth_requestAccounts" });
      }
      const code = await provider.getCode(BATCH_TRANSFER_ADDRESS);
      if (code === "0x") {
        throw new Error("当前链上未找到批量转账合约，请切换到 BSC Testnet");
      }
      const signer = await provider.getSigner();
      const contract = new Contract(
        BATCH_TRANSFER_ADDRESS,
        BATCH_TRANSFER_ABI,
        signer,
      );
      const fn = contract.getFunction(preview.request.method);
      const overrides =
        preview.request.value > BigInt(0) ? [{ value: preview.request.value }] : [];
      const tx = await fn(...preview.request.args, ...overrides);
      setTxHash(tx.hash);
    } catch (error) {
      setErrorMessage("交易发送失败：" + extractContractErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  const unitLabel =
    assetType === "eth" ? "ETH" : assetType === "erc20" ? "Token" : "Token ID";
  const requiresApproval = assetType !== "eth";
  const canSend =
    Boolean(preview.request) &&
    !isSending &&
    !isApproving &&
    (!requiresApproval || approvalStatus === "approved");
  const chainLabel =
    chainId === null
      ? "未连接"
      : `${networkName && networkName !== "unknown" ? networkName : "Chain"} (#${chainId})`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          批量转账
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          使用 BSC Testnet BatchTransfer 合约批量发送 ETH、ERC20 或 ERC721。
          ERC20 与 ERC721 发送前需先授权该合约转出你的资产。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">合约与钱包</h2>
            <p className="mt-1 text-sm text-slate-500">
              当前配置为 BSC Testnet，合约地址固定使用已部署实例。
            </p>
          </div>
          {chainId !== null && chainId !== BSC_TESTNET_CHAIN_ID && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              当前不是 BSC Testnet
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              BatchTransfer
            </label>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              onClick={handleCopyContract}
              title="复制合约地址"
            >
              {shortAddress(BATCH_TRANSFER_ADDRESS)}
            </button>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              当前钱包
            </label>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-600 transition hover:border-slate-300"
              onClick={openWalletModal}
            >
              {account || "连接钱包"}
            </button>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              当前链
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {chainLabel}
            </div>
          </div>
        </div>
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">转账参数</h2>
          <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {ASSET_OPTIONS.map((item) => {
              const isActive = item.value === assetType;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => handleAssetTypeChange(item.value)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {assetType !== "eth" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Token 合约地址
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={tokenAddress}
                onChange={(event) => setTokenAddress(event.target.value)}
                placeholder="0x..."
              />
            </div>
          )}
          {assetType === "erc20" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Token 精度
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={decimals}
                onChange={(event) => setDecimals(event.target.value)}
                inputMode="numeric"
                placeholder="18"
              />
            </div>
          )}
        </div>

        {assetType !== "erc721" && (
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { label: "每人相同金额", value: "equal" as const },
              { label: "每行不同金额", value: "varied" as const },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  amountMode === item.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
                onClick={() => setAmountMode(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              收款地址
            </label>
            <textarea
              className="min-h-56 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={receiversText}
              onChange={(event) => setReceiversText(event.target.value)}
              placeholder={"每行一个地址\n0x...\n0x..."}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {assetType === "erc721"
                ? "Token ID"
                : effectiveAmountMode === "equal"
                  ? `单个地址金额 (${unitLabel})`
                  : `金额列表 (${unitLabel})`}
            </label>
            {effectiveAmountMode === "equal" ? (
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={singleAmount}
                onChange={(event) => setSingleAmount(event.target.value)}
                placeholder="0.01"
              />
            ) : (
              <textarea
                className="min-h-56 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={amountsText}
                onChange={(event) => setAmountsText(event.target.value)}
                placeholder={
                  assetType === "erc721"
                    ? "每行一个 tokenId\n1\n2"
                    : "每行一个金额，与收款地址逐行对应\n0.01\n0.02"
                }
              />
            )}
          </div>
        </div>
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">发送预览</h2>
          <div className="flex flex-wrap gap-2">
            {requiresApproval && (
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                onClick={handleApprove}
                disabled={
                  isApproving ||
                  isSending ||
                  !preview.request ||
                  approvalStatus === "approved" ||
                  approvalStatus === "checking"
                }
              >
                {isApproving
                  ? "授权中..."
                  : approvalStatus === "checking"
                    ? "检查授权..."
                    : approvalStatus === "approved"
                      ? "已授权"
                      : assetType === "erc20"
                        ? "授权 ERC20"
                        : "授权 ERC721"}
              </button>
            )}
            <button
              type="button"
              className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              onClick={handleSend}
              disabled={!canSend}
            >
              {isSending ? "发送中..." : "发送批量转账"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-400">收款数量</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {preview.request?.summary.receiverCount ?? 0}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-400">
              {assetType === "erc721" ? "NFT 数量" : "总金额"}
            </div>
            <div className="mt-1 break-all text-xl font-semibold text-slate-900">
              {preview.request
                ? formatBigintValue(preview.request.summary.totalAmount, parsedDecimals)
                : "0"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-400">调用方法</div>
            <div className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
              {preview.request?.method ?? "-"}
            </div>
          </div>
        </div>

        {preview.error && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {preview.error}
          </div>
        )}
        {requiresApproval && approvalMessage && (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              approvalStatus === "approved"
                ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                : approvalStatus === "not-approved"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {approvalMessage}
            {approvalHash && (
              <span className="ml-1 break-all font-mono">{approvalHash}</span>
            )}
          </div>
        )}
        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}
        {txHash && (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            交易已发送：
            <span className="ml-1 break-all font-mono">{txHash}</span>
          </div>
        )}
        {copyMessage && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {copyMessage}
          </div>
        )}
      </section>
    </div>
  );
};

export default BatchTransfer;
