"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, formatEther, getAddress, Interface, parseUnits, Wallet } from "ethers";

import {
  extractContractErrorMessage,
  isIntegerParamType,
  parseErc20ApprovalAmount,
  type IntegerUnit,
} from "./contract-interaction-utils";
import { useWallet } from "./wallet/WalletProvider";
import {
  buildExecutionPlan,
  buildRelationshipCallArgs,
  buildRelationshipGraphLayout,
  buildWalletLabel,
  exportRelationshipTxt,
  getAddressFunctionOptions,
  splitGraphAndAvailableWallets,
  shortRelationshipAddress,
  validateRelationships,
  type RelationshipExecutionTask,
  type RelationshipFunctionOption,
  type RelationshipGraphLayout,
  type RelationshipRelation,
  type RelationshipTaskTransaction,
  type RelationshipTaskTransactionStatus,
  type RelationshipWallet,
} from "./relationship-utils";

type SavedAbi = {
  name: string;
  abi: string;
};

type VaultWallet = RelationshipWallet & {
  privateKey?: string;
};

type WalletVault = {
  version: 1;
  createdAt: string;
  wallets: VaultWallet[];
};

type WalletBalance = {
  native: string;
  error?: string;
};

type NativeSweepResult = {
  walletId: string;
  address: string;
  status: "success" | "failed";
  amount: string;
  txHash: string | null;
  error: string | null;
};

type RelationshipApprovalConfig = {
  id: string;
  tokenAddress: string;
  symbol?: string;
  decimals: string;
  amount: string;
  useMax: boolean;
  metadataAddress?: string;
  metadataError?: string;
};

const ABI_LIST_KEY = "abiList";
const ERC20_APPROVAL_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
];
const ERC20_METADATA_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const integerUnitDecimals: Record<IntegerUnit, number> = {
  wei: 0,
  gwei: 9,
  ether: 18,
};

const buttonClass =
  "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const primaryButtonClass =
  "rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400";

const dangerButtonClass =
  "rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50";

const safeJsonParse = <T,>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const downloadTextFile = (fileName: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const parseNativeValue = (value: string, unit: IntegerUnit) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return BigInt(0);
  }
  try {
    return parseUnits(trimmed, integerUnitDecimals[unit]);
  } catch {
    if (unit === "wei") {
      throw new Error("Payable Value 使用 wei 单位时必须是整数");
    }
    throw new Error(`Payable Value 必须是有效的 ${unit} 数值`);
  }
};

const parseVault = (value: unknown): WalletVault => {
  if (!value || typeof value !== "object") {
    throw new Error("Vault 文件格式无效");
  }
  const vault = value as Partial<WalletVault>;
  if (vault.version !== 1 || !Array.isArray(vault.wallets)) {
    throw new Error("Vault 文件版本或钱包列表无效");
  }
  return {
    version: 1,
    createdAt: typeof vault.createdAt === "string" ? vault.createdAt : new Date().toISOString(),
    wallets: vault.wallets.map((wallet, index) => {
      if (!wallet || typeof wallet !== "object") {
        throw new Error(`第 ${index + 1} 个钱包格式无效`);
      }
      const item = wallet as Partial<VaultWallet>;
      if (!item.id || !item.privateKey) {
        throw new Error(`第 ${index + 1} 个钱包缺少必要字段`);
      }
      const derivedAddress = new Wallet(item.privateKey).address;
      return {
        id: item.id,
        address: getAddress(derivedAddress),
        privateKey: item.privateKey,
      };
    }),
  };
};

const transactionStatusClass: Record<RelationshipTaskTransactionStatus, string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-500",
  running: "border-sky-100 bg-sky-50 text-sky-700",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
  failed: "border-rose-100 bg-rose-50 text-rose-700",
  skipped: "border-slate-200 bg-slate-50 text-slate-400",
};

const TransactionStatusIcon = ({
  status,
}: {
  status: RelationshipTaskTransactionStatus;
}) => {
  if (status === "running") {
    return (
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
    );
  }
  if (status === "success") {
    return <span className="text-sm font-bold text-emerald-600">✓</span>;
  }
  if (status === "failed") {
    return <span className="text-sm font-bold text-rose-600">×</span>;
  }
  if (status === "skipped") {
    return <span className="text-sm font-bold text-slate-400">–</span>;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />;
};

const TransactionStepList = ({
  transactions,
}: {
  transactions: RelationshipTaskTransaction[];
}) => {
  if (transactions.length === 0) {
    return <span className="font-mono text-xs text-slate-400">-</span>;
  }
  return (
    <div className="space-y-2">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className={`rounded-xl border px-3 py-2 ${transactionStatusClass[transaction.status]}`}
        >
          <div className="flex items-center gap-2">
            <TransactionStatusIcon status={transaction.status} />
            <span className="text-xs font-semibold text-slate-700">
              {transaction.label}
            </span>
          </div>
          <div className="mt-1 break-all font-mono text-xs">
            {transaction.txHash || transaction.error || "-"}
          </div>
        </div>
      ))}
    </div>
  );
};

type RelationshipGraphViewProps = {
  layout: RelationshipGraphLayout;
  draggingWalletId: string | null;
  onDragStart: (walletId: string) => void;
  onDragEnd: () => void;
  onDropOnInviter: (walletId: string, inviterId: string) => void;
  onRemoveRelation: (walletId: string) => void;
};

const RelationshipGraphView = ({
  layout,
  draggingWalletId,
  onDragStart,
  onDragEnd,
  onDropOnInviter,
  onRemoveRelation,
}: RelationshipGraphViewProps) => {
  const nodeById = new Map(layout.nodes.map((node) => [node.wallet.id, node]));

  return (
    <div
      className="relative min-h-[320px] min-w-full"
      style={{ width: layout.width, height: layout.height }}
    >
      <svg
        className="pointer-events-none absolute inset-0"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
      >
        <defs>
          <marker
            id="relationship-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="4"
            refY="4"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b" />
          </marker>
        </defs>
        {layout.edges.map((edge) => {
          const from = nodeById.get(edge.fromWalletId);
          const to = nodeById.get(edge.toWalletId);
          if (!from || !to) {
            return null;
          }
          const startX = from.x + layout.nodeWidth / 2;
          const startY = from.y + layout.nodeHeight;
          const endX = to.x + layout.nodeWidth / 2;
          const endY = to.y;
          const middleY = startY + (endY - startY) / 2;
          return (
            <path
              key={`${edge.fromWalletId}-${edge.toWalletId}`}
              d={`M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY - 8}`}
              fill="none"
              markerEnd="url(#relationship-arrow)"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>
      {layout.nodes.map((node) => {
        const isRoot = node.level === 0;
        const isDropTarget = Boolean(
          draggingWalletId && draggingWalletId !== node.wallet.id,
        );

        return (
          <div
            key={node.wallet.id}
            draggable
            onDragStart={() => onDragStart(node.wallet.id)}
            onDragEnd={onDragEnd}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggingWalletId && draggingWalletId !== node.wallet.id) {
                onDropOnInviter(draggingWalletId, node.wallet.id);
              }
            }}
            className={`absolute rounded-xl border bg-white px-3 py-2 shadow-sm transition ${
              isDropTarget
                ? "border-slate-300 ring-2 ring-slate-100"
                : isRoot
                  ? "border-slate-900"
                  : "border-slate-200"
            }`}
            style={{
              left: node.x,
              top: node.y,
              width: layout.nodeWidth,
              minHeight: layout.nodeHeight,
            }}
            title="拖动其他钱包到此节点，将此节点设为上级"
          >
            {isRoot && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                Root
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {buildWalletLabel(node.wallet)}
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-500" title={node.wallet.address}>
                  {shortRelationshipAddress(node.wallet.address)}
                </div>
              </div>
              {!isRoot && (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-rose-500 hover:text-rose-700"
                  onClick={() => onRemoveRelation(node.wallet.id)}
                >
                  移除
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">
                Level {node.level}
              </span>
              {draggingWalletId === node.wallet.id && <span>拖动中</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RelationshipManager = () => {
  const { provider, networkName, nativeCurrencySymbol, chainId, openWalletModal } =
    useWallet();
  const [walletCount, setWalletCount] = useState("100");
  const [wallets, setWallets] = useState<RelationshipWallet[]>([]);
  const [vault, setVault] = useState<WalletVault | null>(null);
  const [walletSecrets, setWalletSecrets] = useState<Record<string, string>>({});
  const [selectedWalletIds, setSelectedWalletIds] = useState<Set<string>>(new Set());
  const [relations, setRelations] = useState<RelationshipRelation[]>([]);
  const [balances, setBalances] = useState<Record<string, WalletBalance>>({});
  const [detailWalletId, setDetailWalletId] = useState<string | null>(null);
  const [isPrivateKeyVisible, setIsPrivateKeyVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [draggingWalletId, setDraggingWalletId] = useState<string | null>(null);
  const [savedAbis, setSavedAbis] = useState<SavedAbi[]>([]);
  const [selectedAbiIndex, setSelectedAbiIndex] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [selectedFunction, setSelectedFunction] = useState("");
  const [inviterInputIndex, setInviterInputIndex] = useState("");
  const [fixedArgumentInputs, setFixedArgumentInputs] = useState<Record<number, string>>({});
  const [fixedArgumentUnits, setFixedArgumentUnits] = useState<Record<number, IntegerUnit>>({});
  const [payableValue, setPayableValue] = useState("");
  const [payableValueUnit, setPayableValueUnit] = useState<IntegerUnit>("ether");
  const [approvalConfigs, setApprovalConfigs] = useState<RelationshipApprovalConfig[]>([
    { id: "approval-1", tokenAddress: "", decimals: "18", amount: "", useMax: false },
  ]);
  const [metadataLoadingIds, setMetadataLoadingIds] = useState<Set<string>>(new Set());
  const [rootInviterInputs, setRootInviterInputs] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<RelationshipExecutionTask[]>([]);
  const [concurrency, setConcurrency] = useState("3");
  const [sweepRecipientAddress, setSweepRecipientAddress] = useState("");
  const [sweepResults, setSweepResults] = useState<NativeSweepResult[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isQueryingBalances, setIsQueryingBalances] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const fetchApprovalTokenMetadata = useCallback(
    async (id: string, tokenAddress: string) => {
      if (!provider) {
        return;
      }
      setMetadataLoadingIds((previous) => new Set(previous).add(id));
      try {
        const tokenContract = new Contract(tokenAddress, ERC20_METADATA_ABI, provider);
        const [symbol, decimals] = await Promise.all([
          tokenContract.getFunction("symbol")(),
          tokenContract.getFunction("decimals")(),
        ]);
        setApprovalConfigs((previous) =>
          previous.map((config) =>
            config.id === id
              ? {
                  ...config,
                  symbol: String(symbol),
                  decimals: String(Number(decimals)),
                  metadataAddress: tokenAddress,
                  metadataError: "",
                }
              : config,
          ),
        );
      } catch (error) {
        setApprovalConfigs((previous) =>
          previous.map((config) =>
            config.id === id
              ? {
                  ...config,
                  symbol: "",
                  metadataAddress: tokenAddress,
                  metadataError: extractContractErrorMessage(error),
                }
              : config,
          ),
        );
      } finally {
        setMetadataLoadingIds((previous) => {
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
      }
    },
    [provider],
  );

  useEffect(() => {
    setSavedAbis(safeJsonParse<SavedAbi[]>(
      localStorage.getItem(ABI_LIST_KEY) || "[]",
      [],
    ));
  }, []);

  useEffect(() => {
    if (!provider) {
      return;
    }
    const timers = approvalConfigs
      .map((config) => {
        if (!config.tokenAddress.trim()) {
          return null;
        }
        let tokenAddress = "";
        try {
          tokenAddress = getAddress(config.tokenAddress);
        } catch {
          return null;
        }
        if (
          config.metadataAddress?.toLowerCase() === tokenAddress.toLowerCase() &&
          config.decimals &&
          (config.symbol || config.metadataError)
        ) {
          return null;
        }
        if (metadataLoadingIds.has(config.id)) {
          return null;
        }
        return window.setTimeout(() => {
          void fetchApprovalTokenMetadata(config.id, tokenAddress);
        }, 350);
      })
      .filter((timer): timer is number => timer !== null);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [approvalConfigs, fetchApprovalTokenMetadata, metadataLoadingIds, provider]);

  const walletById = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet])),
    [wallets],
  );
  const validation = useMemo(
    () => validateRelationships(wallets, relations),
    [wallets, relations],
  );
  const selectedAbi = selectedAbiIndex ? savedAbis[Number(selectedAbiIndex)] : null;
  const functionOptions = useMemo(() => {
    if (!selectedAbi?.abi) {
      return [];
    }
    try {
      return getAddressFunctionOptions(selectedAbi.abi);
    } catch {
      return [];
    }
  }, [selectedAbi]);
  const selectedFunctionOption = useMemo(
    () => functionOptions.find((item) => item.signature === selectedFunction) ?? null,
    [functionOptions, selectedFunction],
  );
  const payableFunctionSelected = selectedFunctionOption?.stateMutability === "payable";
  useEffect(() => {
    if (!selectedFunctionOption) {
      setInviterInputIndex("");
      setFixedArgumentInputs({});
      setFixedArgumentUnits({});
      return;
    }
    const firstAddressIndex = selectedFunctionOption.inputs.findIndex(
      (input) => input.type === "address",
    );
    setInviterInputIndex(firstAddressIndex >= 0 ? String(firstAddressIndex) : "");
    setFixedArgumentInputs({});
    setFixedArgumentUnits({});
  }, [selectedFunctionOption]);
  const relationshipWalletGroups = useMemo(
    () => splitGraphAndAvailableWallets(wallets, relations),
    [wallets, relations],
  );
  const graphRelations = useMemo(() => {
    const graphWalletIds = new Set(
      relationshipWalletGroups.graphWallets.map((wallet) => wallet.id),
    );
    return relations.filter(
      (relation) =>
        graphWalletIds.has(relation.walletId) &&
        graphWalletIds.has(relation.inviterId),
    );
  }, [relationshipWalletGroups.graphWallets, relations]);
  const relationshipGraphLayout = useMemo(
    () =>
      buildRelationshipGraphLayout(
        relationshipWalletGroups.graphWallets,
        graphRelations,
        {
          nodeWidth: 160,
          nodeHeight: 58,
          horizontalGap: 36,
          verticalGap: 64,
          padding: 22,
        },
      ),
    [graphRelations, relationshipWalletGroups.graphWallets],
  );
  useEffect(() => {
    if (relationshipWalletGroups.graphWallets.length === 0) {
      setTasks([]);
      return;
    }
    try {
      setTasks(buildExecutionPlan(relationshipWalletGroups.graphWallets, graphRelations));
    } catch {
      setTasks([]);
    }
  }, [graphRelations, relationshipWalletGroups.graphWallets]);
  const detailWallet = detailWalletId ? walletById.get(detailWalletId) : null;
  const detailVaultWallet = detailWalletId
    ? vault?.wallets.find((wallet) => wallet.id === detailWalletId)
    : null;
  const detailPrivateKey =
    detailWalletId && isPrivateKeyVisible ? walletSecrets[detailWalletId] || "" : "";
  const selectedWallets = wallets.filter((wallet) => selectedWalletIds.has(wallet.id));
  const chainLabel =
    chainId === null
      ? "未连接"
      : `${networkName && networkName !== "unknown" ? networkName : "Chain"} (#${chainId})`;
  const nativeSymbol = nativeCurrencySymbol || (chainId === 56 || chainId === 97 ? "BNB" : "ETH");

  const setToast = (text: string) => {
    setMessage(text);
    setErrorMessage("");
  };

  const setError = (text: string) => {
    setErrorMessage(text);
    setMessage("");
  };

  const persistVaultState = (
    nextVault: WalletVault,
    secrets: Record<string, string>,
  ) => {
    setVault(nextVault);
    setWallets(nextVault.wallets.map(({ id, address }) => ({ id, address })));
    setWalletSecrets(secrets);
    setSelectedWalletIds(new Set(nextVault.wallets.map((wallet) => wallet.id)));
    setRelations([]);
    setTasks([]);
    setBalances({});
    setRootInviterInputs({});
    setSweepResults([]);
  };

  const handleCreateWallets = async () => {
    const count = Number(walletCount);
    setMessage("");
    setErrorMessage("");
    if (!Number.isInteger(count) || count <= 0 || count > 500) {
      setError("创建数量需要是 1 到 500 的整数");
      return;
    }
    try {
      setIsCreating(true);
      const nextSecrets: Record<string, string> = {};
      const nextWallets: VaultWallet[] = [];
      for (let index = 0; index < count; index += 1) {
        const wallet = Wallet.createRandom();
        const id = `wallet-${index + 1}`;
        nextSecrets[id] = wallet.privateKey;
        nextWallets.push({
          id,
          address: wallet.address,
          privateKey: wallet.privateKey,
        });
      }
      const nextVault: WalletVault = {
        version: 1,
        createdAt: new Date().toISOString(),
        wallets: nextWallets,
      };
      persistVaultState(nextVault, nextSecrets);
      downloadTextFile(
        "wallet-vault.json",
        JSON.stringify(nextVault, null, 2),
        "application/json",
      );
      setToast(`已创建 ${count} 个钱包并生成 wallet-vault.json`);
    } catch (error) {
      setError("创建钱包失败：" + extractContractErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const loadVaultSecrets = (nextVault: WalletVault) => {
    const nextSecrets: Record<string, string> = {};
    for (const wallet of nextVault.wallets) {
      nextSecrets[wallet.id] = wallet.privateKey || "";
    }
    return nextSecrets;
  };

  const importParsedVault = (nextVault: WalletVault) => {
    const nextSecrets = loadVaultSecrets(nextVault);
    persistVaultState(nextVault, nextSecrets);
    setToast(`已加载 ${nextVault.wallets.length} 个钱包`);
  };

  const handleSelectVaultFile = async (file: File | null) => {
    setMessage("");
    setErrorMessage("");
    if (!file) {
      return;
    }
    try {
      setIsImporting(true);
      const text = await file.text();
      const nextVault = parseVault(JSON.parse(text));
      importParsedVault(nextVault);
    } catch (error) {
      setError("导入 Vault 失败：" + extractContractErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  const toggleWalletSelection = (walletId: string) => {
    setSelectedWalletIds((previous) => {
      const next = new Set(previous);
      if (next.has(walletId)) {
        next.delete(walletId);
      } else {
        next.add(walletId);
      }
      return next;
    });
  };

  const selectedOrAllWallets = () => (selectedWallets.length > 0 ? selectedWallets : wallets);

  const updateApprovalConfig = (
    id: string,
    next: Partial<RelationshipApprovalConfig>,
  ) => {
    setApprovalConfigs((previous) =>
      previous.map((config) => (config.id === id ? { ...config, ...next } : config)),
    );
  };

  const addApprovalConfig = () => {
    setApprovalConfigs((previous) => [
      ...previous,
      {
        id: `approval-${Date.now()}`,
        tokenAddress: "",
        decimals: "18",
        amount: "",
        useMax: false,
      },
    ]);
  };

  const removeApprovalConfig = (id: string) => {
    setApprovalConfigs((previous) =>
      previous.length <= 1
        ? previous
        : previous.filter((config) => config.id !== id),
    );
  };

  const copyAddresses = async (scope: "all" | "selected") => {
    const scopedWallets = scope === "all" ? wallets : selectedOrAllWallets();
    if (scopedWallets.length === 0) {
      setError("暂无可复制地址");
      return;
    }
    try {
      await navigator.clipboard.writeText(exportRelationshipTxt(scopedWallets));
      setToast(scope === "all" ? "全部地址已复制" : "选中地址已复制");
    } catch {
      setError("复制失败，请检查浏览器权限");
    }
  };

  const handleSetRelation = (walletId: string, inviterId: string) => {
    setErrorMessage("");
    setMessage("");
    const withoutWallet = relations.filter((relation) => relation.walletId !== walletId);
    if (!inviterId || walletId === inviterId) {
      setRelations(withoutWallet);
      return;
    }
    const nextRelations = [...withoutWallet, { walletId, inviterId }];
    const nextValidation = validateRelationships(wallets, nextRelations);
    if (!nextValidation.ok) {
      setError(nextValidation.errors.join("；"));
      return;
    }
    setRelations(nextRelations);
  };

  const checkRelations = () => {
    if (validation.ok) {
      setToast("关系检查通过");
      return;
    }
    setError(validation.errors.join("；"));
  };

  const queryBalances = async () => {
    setMessage("");
    setErrorMessage("");
    if (!provider) {
      setError("请先连接钱包，使用当前网络查询余额");
      openWalletModal();
      return;
    }
    if (wallets.length === 0) {
      setError("暂无可查询钱包");
      return;
    }
    try {
      setIsQueryingBalances(true);
      const nextBalances: Record<string, WalletBalance> = {};
      for (let start = 0; start < wallets.length; start += 10) {
        const batch = wallets.slice(start, start + 10);
        await Promise.all(
          batch.map(async (wallet) => {
            try {
              const nativeBalance = await provider.getBalance(wallet.address);
              nextBalances[wallet.id] = {
                native: formatEther(nativeBalance),
              };
            } catch (error) {
              nextBalances[wallet.id] = {
                native: "-",
                error: extractContractErrorMessage(error),
              };
            }
          }),
        );
        setBalances((previous) => ({ ...previous, ...nextBalances }));
      }
      setToast("余额查询完成");
    } finally {
      setIsQueryingBalances(false);
    }
  };

  const sweepNativeAssets = async () => {
    setMessage("");
    setErrorMessage("");
    if (!provider) {
      setError("请先连接钱包，使用当前网络归集原生资产");
      openWalletModal();
      return;
    }
    const scopedWallets = selectedOrAllWallets();
    if (scopedWallets.length === 0) {
      setError("暂无可归集钱包");
      return;
    }
    let recipient = "";
    try {
      recipient = getAddress(sweepRecipientAddress);
    } catch {
      setError("请输入有效归集地址");
      return;
    }

    try {
      setIsSweeping(true);
      setSweepResults([]);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
      if (!gasPrice) {
        setError("当前网络无法获取 gas price");
        return;
      }

      for (const wallet of scopedWallets) {
        const privateKey = walletSecrets[wallet.id];
        if (!privateKey) {
          setSweepResults((previous) => [
            ...previous,
            {
              walletId: wallet.id,
              address: wallet.address,
              status: "failed",
              amount: "0",
              txHash: null,
              error: "PrivateKey 不存在",
            },
          ]);
          continue;
        }

        try {
          const signer = new Wallet(privateKey, provider);
          const balance = await provider.getBalance(wallet.address);
          const estimatedGas = await signer
            .estimateGas({ to: recipient, value: balance > BigInt(0) ? BigInt(1) : BigInt(0) })
            .catch(() => BigInt(21000));
          const gasCost = estimatedGas * gasPrice;
          if (balance <= gasCost) {
            setSweepResults((previous) => [
              ...previous,
              {
                walletId: wallet.id,
                address: wallet.address,
                status: "failed",
                amount: "0",
                txHash: null,
                error: "余额不足以支付 gas",
              },
            ]);
            continue;
          }
          const value = balance - gasCost;
          const tx = await signer.sendTransaction({
            to: recipient,
            value,
            gasLimit: estimatedGas,
            gasPrice,
          });
          setSweepResults((previous) => [
            ...previous,
            {
              walletId: wallet.id,
              address: wallet.address,
              status: "success",
              amount: formatEther(value),
              txHash: tx.hash,
              error: null,
            },
          ]);
        } catch (error) {
          setSweepResults((previous) => [
            ...previous,
            {
              walletId: wallet.id,
              address: wallet.address,
              status: "failed",
              amount: "0",
              txHash: null,
              error: extractContractErrorMessage(error),
            },
          ]);
        }
      }
      setToast("原生资产归集流程结束");
    } finally {
      setIsSweeping(false);
    }
  };

  const updateTask = (taskId: string, next: Partial<RelationshipExecutionTask>) => {
    setTasks((previous) =>
      previous.map((task) => (task.id === taskId ? { ...task, ...next } : task)),
    );
  };

  const updateTaskTransaction = (
    taskId: string,
    transactionId: string,
    next: Partial<RelationshipTaskTransaction>,
  ) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId
          ? {
              ...task,
              transactions: task.transactions.map((transaction) =>
                transaction.id === transactionId
                  ? { ...transaction, ...next }
                  : transaction,
              ),
            }
          : task,
      ),
    );
  };

  const buildTaskTransactions = (
    task: RelationshipExecutionTask,
    selectedApprovalConfigs: Array<{ id: string; label: string }>,
  ): RelationshipTaskTransaction[] => [
    ...selectedApprovalConfigs.map((approval, index) => ({
      id: `${task.id}-approve-${approval.id}`,
      label: `Approve ${approval.label || `Token #${index + 1}`}`,
      status: "pending" as const,
      txHash: null,
      error: null,
    })),
    {
      id: `${task.id}-bind`,
      label: "Bind",
      status: "pending",
      txHash: null,
      error: null,
    },
  ];

  const failTaskWithMessage = (task: RelationshipExecutionTask, message: string) => {
    const transactionId = `${task.id}-prepare`;
    updateTask(task.id, {
      status: "failed",
      error: message,
      transactions: [
        {
          id: transactionId,
          label: "Prepare",
          status: "failed",
          txHash: null,
          error: message,
        },
      ],
    });
  };

  const runTasksForLevel = async (
    levelTasks: RelationshipExecutionTask[],
    contractInterface: Interface,
    fnOption: RelationshipFunctionOption,
    selectedInviterInputIndex: number,
    selectedFixedInputs: Record<number, string>,
    selectedFixedUnits: Record<number, IntegerUnit>,
    selectedApprovalConfigs: Array<{
      id: string;
      label: string;
      tokenAddress: string;
      amount: bigint;
    }>,
    selectedPayableValue: bigint,
    checkedContractAddress: string,
    checkedRootInviterInputs: Record<string, string>,
    maxConcurrency: number,
  ) => {
    let cursor = 0;
    let hasFailure = false;
    const worker = async () => {
      while (cursor < levelTasks.length) {
        const task = levelTasks[cursor];
        cursor += 1;
        const wallet = walletById.get(task.walletId);
        let inviterAddress = "";
        try {
          inviterAddress = task.inviterId
            ? walletById.get(task.inviterId)?.address || ""
            : getAddress(checkedRootInviterInputs[task.walletId] || "");
        } catch {
          hasFailure = true;
          failTaskWithMessage(task, "Root Inviter 地址无效");
          continue;
        }
        if (!wallet || !inviterAddress) {
          hasFailure = true;
          failTaskWithMessage(task, "钱包或上级不存在");
          continue;
        }
        const privateKey = walletSecrets[task.walletId];
        if (!privateKey) {
          hasFailure = true;
          failTaskWithMessage(task, "PrivateKey 不存在");
          continue;
        }
        const taskTransactions = buildTaskTransactions(task, selectedApprovalConfigs);
        let runningTransactionId = "";
        try {
          const nativeBalance = await provider!.getBalance(wallet.address);
          if (nativeBalance === BigInt(0)) {
            hasFailure = true;
            failTaskWithMessage(task, "Gas 不足");
            continue;
          }
          updateTask(task.id, {
            status: "running",
            txHash: null,
            error: null,
            transactions: taskTransactions,
          });
          const signer = new Wallet(privateKey, provider!);
          for (const approval of selectedApprovalConfigs) {
            runningTransactionId = `${task.id}-approve-${approval.id}`;
            updateTaskTransaction(task.id, runningTransactionId, {
              status: "running",
              error: null,
            });
            const tokenCode = await provider!.getCode(approval.tokenAddress);
            if (tokenCode === "0x") {
              throw new Error(`Token ${approval.tokenAddress} 当前链上没有合约代码`);
            }
            const tokenContract = new Contract(
              approval.tokenAddress,
              ERC20_APPROVAL_ABI,
              signer,
            );
            const approve = tokenContract.getFunction("approve");
            const approveTx = await approve(checkedContractAddress, approval.amount);
            updateTaskTransaction(task.id, runningTransactionId, {
              txHash: approveTx.hash,
            });
            await approveTx.wait();
            updateTaskTransaction(task.id, runningTransactionId, {
              status: "success",
              txHash: approveTx.hash,
              error: null,
            });
          }
          const contract = new Contract(checkedContractAddress, contractInterface, signer);
          const fn = contract.getFunction(fnOption.signature);
          const args = buildRelationshipCallArgs({
            fn: fnOption,
            inviterInputIndex: selectedInviterInputIndex,
            fixedInputs: selectedFixedInputs,
            fixedUnits: selectedFixedUnits,
            inviterAddress,
          });
          const txArgs =
            fnOption.stateMutability === "payable" && selectedPayableValue > BigInt(0)
              ? [...args, { value: selectedPayableValue }]
              : args;
          runningTransactionId = `${task.id}-bind`;
          updateTaskTransaction(task.id, runningTransactionId, {
            status: "running",
            error: null,
          });
          const tx = await fn(...txArgs);
          updateTaskTransaction(task.id, runningTransactionId, { txHash: tx.hash });
          await tx.wait();
          updateTaskTransaction(task.id, runningTransactionId, {
            status: "success",
            txHash: tx.hash,
            error: null,
          });
          updateTask(task.id, { status: "success", txHash: tx.hash, error: null });
        } catch (error) {
          hasFailure = true;
          const parsedError = extractContractErrorMessage(error);
          if (runningTransactionId) {
            updateTaskTransaction(task.id, runningTransactionId, {
              status: "failed",
              error: parsedError,
            });
          }
          updateTask(task.id, { status: "failed", error: parsedError });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(maxConcurrency, levelTasks.length) }, () => worker()),
    );
    return !hasFailure;
  };

  const executeTasks = async (failedOnly: boolean) => {
    setMessage("");
    setErrorMessage("");
    if (!provider) {
      setError("请先连接钱包，使用当前网络执行");
      openWalletModal();
      return;
    }
    if (!selectedAbi?.abi) {
      setError("请选择 ABI");
      return;
    }
    if (!selectedFunction) {
      setError("请选择绑定函数");
      return;
    }
    if (!selectedFunctionOption) {
      setError("请选择有效绑定函数");
      return;
    }
    const selectedInviterInputIndex = Number(inviterInputIndex);
    if (
      !Number.isInteger(selectedInviterInputIndex) ||
      selectedFunctionOption.inputs[selectedInviterInputIndex]?.type !== "address"
    ) {
      setError("请选择接收 inviter 的 address 参数");
      return;
    }
    let checkedContractAddress = "";
    try {
      checkedContractAddress = getAddress(contractAddress);
    } catch {
      setError("请输入有效合约地址");
      return;
    }
    let baseTasks = tasks;
    if (baseTasks.length === 0) {
      try {
        baseTasks = buildExecutionPlan(relationshipWalletGroups.graphWallets, graphRelations);
        setTasks(baseTasks);
      } catch (error) {
        setError(error instanceof Error ? error.message : "执行计划生成失败");
        return;
      }
    }
    const runnableTasks = failedOnly
      ? baseTasks.filter((task) => task.status === "failed")
      : baseTasks.filter((task) => task.status !== "success");
    if (runnableTasks.length === 0) {
      setError(failedOnly ? "暂无失败任务可重试" : "暂无可执行任务");
      return;
    }
    const checkedRootInviterInputs: Record<string, string> = {};
    for (const task of runnableTasks) {
      if (task.inviterId !== null) {
        continue;
      }
      try {
        checkedRootInviterInputs[task.walletId] = getAddress(
          rootInviterInputs[task.walletId] || "",
        );
      } catch {
        const wallet = walletById.get(task.walletId);
        setError(`${wallet ? buildWalletLabel(wallet) : task.walletId} 的 Root Inviter 地址无效`);
        return;
      }
    }
    try {
      buildRelationshipCallArgs({
        fn: selectedFunctionOption,
        inviterInputIndex: selectedInviterInputIndex,
        fixedInputs: fixedArgumentInputs,
        fixedUnits: fixedArgumentUnits,
        inviterAddress: "0x0000000000000000000000000000000000000000",
      });
    } catch (error) {
      setError("参数配置错误：" + extractContractErrorMessage(error));
      return;
    }
    const checkedApprovalConfigs: Array<{
      id: string;
      label: string;
      tokenAddress: string;
      amount: bigint;
    }> = [];
    for (const [index, config] of approvalConfigs.entries()) {
      if (!config.tokenAddress.trim()) {
        continue;
      }
      try {
        checkedApprovalConfigs.push({
          id: config.id,
          label: config.symbol || `Token #${index + 1}`,
          tokenAddress: getAddress(config.tokenAddress),
          amount: parseErc20ApprovalAmount(
            config.amount,
            Number(config.decimals),
            config.useMax,
          ),
        });
      } catch (error) {
        setError("授权配置错误：" + extractContractErrorMessage(error));
        return;
      }
    }
    let checkedPayableValue = BigInt(0);
    if (payableFunctionSelected) {
      try {
        checkedPayableValue = parseNativeValue(payableValue, payableValueUnit);
      } catch (error) {
        setError(extractContractErrorMessage(error));
        return;
      }
    }
    const maxConcurrency = Math.max(1, Math.min(10, Number(concurrency) || 3));
    const iface = new Interface(selectedAbi.abi);
    const runnableLevels = Array.from(
      runnableTasks.reduce((groups, task) => {
        groups.set(task.level, [...(groups.get(task.level) || []), task]);
        return groups;
      }, new Map<number, RelationshipExecutionTask[]>()),
    ).sort(([left], [right]) => left - right);

    try {
      setIsExecuting(true);
      for (let index = 0; index < runnableLevels.length; index += 1) {
        const [level, levelTasks] = runnableLevels[index];
        const levelSucceeded = await runTasksForLevel(
          levelTasks,
          iface,
          selectedFunctionOption,
          selectedInviterInputIndex,
          fixedArgumentInputs,
          fixedArgumentUnits,
          checkedApprovalConfigs,
          checkedPayableValue,
          checkedContractAddress,
          checkedRootInviterInputs,
          maxConcurrency,
        );
        if (!levelSucceeded) {
          runnableLevels.slice(index + 1).forEach(([, nextLevelTasks]) => {
            nextLevelTasks.forEach((task) =>
              updateTask(task.id, {
                status: "skipped",
                error: `Level ${level} 未全部成功，已暂停后续层级`,
                transactions: [
                  {
                    id: `${task.id}-skipped`,
                    label: "Skipped",
                    status: "skipped",
                    txHash: null,
                    error: `Level ${level} 未全部成功，已暂停后续层级`,
                  },
                ],
              }),
            );
          });
          break;
        }
      }
      setToast("执行流程结束");
    } finally {
      setIsExecuting(false);
    }
  };

  const closeDetail = () => {
    setDetailWalletId(null);
    setIsPrivateKeyVisible(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          Relationship
        </h1>
        <p className="max-w-3xl text-sm text-slate-600 md:text-base">
          创建测试钱包、维护绑定树、批量充值地址，并按层级使用每个钱包自己的私钥发送绑定交易。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">钱包管理</h2>
            <p className="mt-1 text-sm text-slate-500">
              Vault 直接保存 privateKey，选择文件后立即导入；请只用于测试钱包。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            已加载 {wallets.length} 个钱包
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[160px_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              创建数量
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={walletCount}
              onChange={(event) => setWalletCount(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              onClick={handleCreateWallets}
              disabled={isCreating}
            >
              {isCreating ? "创建中..." : "创建钱包"}
            </button>
            <label
              className={`${buttonClass} ${isImporting ? "cursor-not-allowed bg-slate-100 text-slate-400" : "cursor-pointer"}`}
              htmlFor="relationship-vault-file"
            >
              {isImporting ? "导入中..." : "导入 wallet-vault.json"}
            </label>
            <input
              id="relationship-vault-file"
              className="sr-only"
              type="file"
              accept="application/json,.json"
              disabled={isImporting}
              onChange={(event) => {
                void handleSelectVaultFile(event.target.files?.[0] || null);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">地址列表</h2>
            <p className="mt-1 text-sm text-slate-500">
              共 {wallets.length} 个，已选 {selectedWalletIds.size} 个，当前链 {chainLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                setSelectedWalletIds(
                  selectedWalletIds.size === wallets.length
                    ? new Set()
                    : new Set(wallets.map((wallet) => wallet.id)),
                )
              }
            >
              {selectedWalletIds.size === wallets.length ? "取消全选" : "全选"}
            </button>
            <button type="button" className={buttonClass} onClick={() => copyAddresses("all")}>
              复制全部地址
            </button>
            <button type="button" className={buttonClass} onClick={() => copyAddresses("selected")}>
              复制选中地址
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={queryBalances}
              disabled={isQueryingBalances}
            >
              {isQueryingBalances ? "查询中..." : "查询余额"}
            </button>
          </div>
        </div>
        <div className="max-h-[292px] overflow-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white text-xs uppercase tracking-[0.18em] text-slate-400 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="px-3 py-3">选择</th>
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">地址</th>
                <th className="px-3 py-3">{nativeSymbol}</th>
                <th className="px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallets.map((wallet, index) => (
                <tr key={wallet.id} className="text-slate-700">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedWalletIds.has(wallet.id)}
                      onChange={() => toggleWalletSelection(wallet.id)}
                    />
                  </td>
                  <td className="px-3 py-3 font-semibold">{index + 1}</td>
                  <td className="px-3 py-3 font-mono" title={wallet.address}>
                    {wallet.address}
                  </td>
                  <td className="px-3 py-3">{balances[wallet.id]?.native ?? "-"}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="text-sm font-semibold text-slate-900 underline-offset-4 hover:underline"
                      onClick={() => {
                        setDetailWalletId(wallet.id);
                        setIsPrivateKeyVisible(false);
                      }}
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
              {wallets.length === 0 && (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-400" colSpan={5}>
                    暂无钱包
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[280px] flex-1">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                原生资产归集地址
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={sweepRecipientAddress}
                onChange={(event) => setSweepRecipientAddress(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={sweepNativeAssets}
              disabled={isSweeping}
            >
              {isSweeping ? "归集中..." : "归集"}
            </button>
          </div>
          {sweepResults.length > 0 && (
            <div className="mt-4 max-h-56 overflow-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="uppercase tracking-[0.16em] text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Wallet</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Tx / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sweepResults.map((result) => {
                    const wallet = walletById.get(result.walletId);
                    return (
                      <tr key={`${result.walletId}-${result.txHash || result.error}`}>
                        <td className="px-3 py-2">
                          {wallet ? buildWalletLabel(wallet) : result.walletId}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {result.amount} {nativeSymbol}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-1 font-semibold ${
                              result.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {result.status === "success" ? "成功" : "失败"}
                          </span>
                        </td>
                        <td className="max-w-md break-all px-3 py-2 font-mono text-slate-600">
                          {result.txHash || result.error || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">关系编辑</h2>
              <p className="mt-1 text-sm text-slate-500">
                拖动钱包到目标上级节点上，自动生成父子关系。
              </p>
            </div>
            <button type="button" className={buttonClass} onClick={checkRelations}>
              检查关系
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-h-[380px] overflow-auto rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">Graph View</span>
                <span>
                  {relationshipGraphLayout.nodes.filter((node) => node.level === 0).length} Root
                </span>
              </div>
              <div className="pb-2">
                {relationshipWalletGroups.graphWallets.length > 0 && (
                  <RelationshipGraphView
                    layout={relationshipGraphLayout}
                    draggingWalletId={draggingWalletId}
                    onDragStart={setDraggingWalletId}
                    onDragEnd={() => setDraggingWalletId(null)}
                    onDropOnInviter={handleSetRelation}
                    onRemoveRelation={(walletId) => handleSetRelation(walletId, "")}
                  />
                )}
                {wallets.length === 0 && (
                  <div className="flex min-h-48 w-full min-w-[480px] items-center justify-center text-sm text-slate-400">
                    暂无钱包
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">待加入钱包</h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500">
                  {relationshipWalletGroups.availableWallets.length}
                </span>
              </div>
              <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                {relationshipWalletGroups.availableWallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    draggable
                    onDragStart={() => setDraggingWalletId(wallet.id)}
                    onDragEnd={() => setDraggingWalletId(null)}
                    className="cursor-grab rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition active:cursor-grabbing hover:border-slate-300"
                    title="拖到左侧关系图里的上级节点上"
                  >
                    <div className="text-xs font-semibold text-slate-900">
                      {buildWalletLabel(wallet)}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500" title={wallet.address}>
                      {shortRelationshipAddress(wallet.address)}
                    </div>
                  </div>
                ))}
                {relationshipWalletGroups.availableWallets.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs text-slate-400">
                    暂无待加入钱包
                  </div>
                )}
              </div>
            </aside>
          </div>
          {!validation.ok && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {validation.errors.join("；")}
            </div>
          )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">合约配置</h2>
            <p className="mt-1 text-sm text-slate-500">
              从 ABI 管理读取已保存 ABI，并配置绑定方法的参数映射。
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-700">
              合约地址
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={contractAddress}
              onChange={(event) => setContractAddress(event.target.value)}
              placeholder="0x..."
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-700">
              ABI
            </span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              value={selectedAbiIndex}
              onChange={(event) => {
                setSelectedAbiIndex(event.target.value);
                setSelectedFunction("");
              }}
            >
              <option value="">选择已有 ABI</option>
              {savedAbis.map((abi, index) => (
                <option key={`${abi.name}-${index}`} value={index}>
                  {abi.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-700">
              绑定方法
            </span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              value={selectedFunction}
              onChange={(event) => setSelectedFunction(event.target.value)}
            >
              <option value="">选择函数</option>
              {functionOptions.map((item) => (
                <option key={item.signature} value={item.signature}>
                  {item.signature}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedFunctionOption && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">参数配置</h3>
                <p className="mt-1 text-xs text-slate-500">
                  选择哪个 address 参数使用每个任务的 inviter，其余参数使用固定值。
                </p>
              </div>
              <label className="min-w-56">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  Inviter 参数
                </span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                  value={inviterInputIndex}
                  onChange={(event) => setInviterInputIndex(event.target.value)}
                >
                  {selectedFunctionOption.inputs
                    .map((input, index) => ({ input, index }))
                    .filter(({ input }) => input.type === "address")
                    .map(({ input, index }) => (
                      <option key={index} value={index}>
                        #{index + 1} {input.name || "address"} ({input.type})
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {selectedFunctionOption.inputs.map((input, index) => {
                const usesInviter = String(index) === inviterInputIndex;
                const usesIntegerUnit = !usesInviter && isIntegerParamType(input);
                return (
                  <label key={`${input.name}-${index}`} className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">
                      #{index + 1} {input.name || "arg"} ({input.type})
                    </span>
                    <div className={usesIntegerUnit ? "grid grid-cols-[minmax(0,1fr)_96px] gap-2" : ""}>
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        value={
                          usesInviter
                            ? "自动填入 inviter"
                            : fixedArgumentInputs[index] ?? ""
                        }
                        onChange={(event) =>
                          setFixedArgumentInputs((previous) => ({
                            ...previous,
                            [index]: event.target.value,
                          }))
                        }
                        disabled={usesInviter}
                        placeholder={usesInviter ? "自动填入 inviter" : "固定参数值"}
                      />
                      {usesIntegerUnit && (
                        <select
                          className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          value={fixedArgumentUnits[index] || "wei"}
                          onChange={(event) =>
                            setFixedArgumentUnits((previous) => ({
                              ...previous,
                              [index]: event.target.value as IntegerUnit,
                            }))
                          }
                        >
                          <option value="wei">wei</option>
                          <option value="gwei">gwei</option>
                          <option value="ether">ether</option>
                        </select>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            {payableFunctionSelected && (
              <div className="mt-4 max-w-xl">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  Payable Value
                </span>
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={payableValue}
                    onChange={(event) => setPayableValue(event.target.value)}
                    placeholder="0"
                  />
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    value={payableValueUnit}
                    onChange={(event) => setPayableValueUnit(event.target.value as IntegerUnit)}
                  >
                    <option value="wei">wei</option>
                    <option value="gwei">gwei</option>
                    <option value="ether">ether</option>
                  </select>
                </div>
              </div>
            )}
            <div className="mt-5 border-t border-slate-200 pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">授权配置</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    每个任务会先把下方 ERC20 授权给合约地址，全部确认后再执行绑定。
                  </p>
                </div>
                <button type="button" className={buttonClass} onClick={addApprovalConfig}>
                  添加 Token
                </button>
              </div>
              <div className="space-y-3">
                {approvalConfigs.map((config, index) => (
                  <div
                    key={config.id}
                    className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(240px,1fr)_100px_minmax(120px,160px)_auto_auto]"
                  >
                    <label>
                      <span className="mb-1 block text-xs font-semibold text-slate-500">
                        Token #{index + 1}
                        {config.symbol ? ` · ${config.symbol}` : ""}
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                        value={config.tokenAddress}
                        onChange={(event) =>
                          updateApprovalConfig(config.id, {
                            tokenAddress: event.target.value,
                            symbol: "",
                            metadataAddress: "",
                            metadataError: "",
                          })
                        }
                        placeholder="0x..."
                      />
                      {(metadataLoadingIds.has(config.id) || config.metadataError) && (
                        <div className="mt-1 text-xs text-slate-400">
                          {metadataLoadingIds.has(config.id)
                            ? "读取 token 信息中..."
                            : `Token 信息读取失败：${config.metadataError}`}
                        </div>
                      )}
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-semibold text-slate-500">
                        Decimals
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                        value={config.decimals}
                        onChange={(event) =>
                          updateApprovalConfig(config.id, { decimals: event.target.value })
                        }
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-semibold text-slate-500">
                        授权数量
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        value={config.amount}
                        onChange={(event) =>
                          updateApprovalConfig(config.id, { amount: event.target.value })
                        }
                        disabled={config.useMax}
                        placeholder={config.useMax ? "Max" : "0"}
                      />
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={config.useMax}
                        onChange={(event) =>
                          updateApprovalConfig(config.id, { useMax: event.target.checked })
                        }
                      />
                      Max
                    </label>
                    <button
                      type="button"
                      className="self-end rounded-xl border border-rose-100 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-200 disabled:cursor-not-allowed disabled:text-slate-300"
                      onClick={() => removeApprovalConfig(config.id)}
                      disabled={approvalConfigs.length <= 1}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">执行计划</h2>
            <p className="mt-1 text-sm text-slate-500">
              关系变化后自动刷新；Level 0 的 Root 任务会先执行。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              并发
              <input
                className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={concurrency}
                onChange={(event) => setConcurrency(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => executeTasks(false)}
              disabled={isExecuting}
            >
              {isExecuting ? "执行中..." : "开始绑定"}
            </button>
            <button
              type="button"
              className={dangerButtonClass}
              onClick={() => executeTasks(true)}
              disabled={isExecuting}
            >
              重新执行失败任务
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
              <tr>
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">Wallet</th>
                <th className="px-3 py-3">Inviter</th>
                <th className="px-3 py-3">Level</th>
                <th className="px-3 py-3">Tx / Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task, index) => {
                const wallet = walletById.get(task.walletId);
                const inviter = task.inviterId ? walletById.get(task.inviterId) : null;
                return (
                  <tr key={task.id}>
                    <td className="px-3 py-3">{index + 1}</td>
                    <td className="px-3 py-3">{wallet ? buildWalletLabel(wallet) : task.walletId}</td>
                    <td className="px-3 py-3">
                      {inviter ? (
                        buildWalletLabel(inviter)
                      ) : (
                        <input
                          className="w-full max-w-[340px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                          value={rootInviterInputs[task.walletId] || ""}
                          onChange={(event) =>
                            setRootInviterInputs((previous) => ({
                              ...previous,
                              [task.walletId]: event.target.value,
                            }))
                          }
                          placeholder="Root inviter 0x..."
                        />
                      )}
                    </td>
                    <td className="px-3 py-3">{task.level}</td>
                    <td className="max-w-xl px-3 py-3">
                      <TransactionStepList transactions={task.transactions} />
                    </td>
                  </tr>
                );
              })}
              {tasks.length === 0 && (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-400" colSpan={5}>
                    暂无执行任务
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(message || errorMessage) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            errorMessage
              ? "border-rose-100 bg-rose-50 text-rose-700"
              : "border-emerald-100 bg-emerald-50 text-emerald-800"
          }`}
        >
          {errorMessage || message}
        </div>
      )}

      {detailWallet && detailVaultWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">钱包详情</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {buildWalletLabel(detailWallet)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-800"
                onClick={closeDetail}
              >
                ×
              </button>
            </div>
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">地址</div>
                <div className="break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-700">
                  {detailWallet.address}
                </div>
                <button
                  type="button"
                  className={`${buttonClass} mt-3`}
                  onClick={async () => {
                    await navigator.clipboard.writeText(detailWallet.address);
                    setToast("地址已复制");
                  }}
                >
                  复制地址
                </button>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Private Key</div>
                <div className="break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-700">
                  {isPrivateKeyVisible ? detailPrivateKey : "••••••••••••••••••••••••••••••••"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setIsPrivateKeyVisible((visible) => !visible)}
                  >
                    {isPrivateKeyVisible ? "隐藏私钥" : "显示私钥"}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={async () => {
                      const privateKey = walletSecrets[detailWallet.id];
                      if (!privateKey) {
                        setError("PrivateKey 不存在");
                        return;
                      }
                      await navigator.clipboard.writeText(privateKey);
                      setToast("私钥已复制");
                    }}
                  >
                    复制私钥
                  </button>
                </div>
              </div>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => {
                  downloadTextFile(
                    `${detailWallet.id}-vault.json`,
                    JSON.stringify(detailVaultWallet, null, 2),
                    "application/json",
                  );
                  setToast("钱包 Vault 已导出");
                }}
              >
                导出单个 Wallet JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RelationshipManager;
