import { FunctionFragment, Interface, isAddress } from "ethers";
import {
  type IntegerUnit,
  parseArgumentValue,
  serializeParamType,
  type AbiInputParam,
} from "./contract-interaction-utils";

export type RelationshipWallet = {
  id: string;
  address: string;
};

export type RelationshipRelation = {
  walletId: string;
  inviterId: string;
};

export type RelationshipTaskStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export type RelationshipTaskTransactionStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export type RelationshipTaskTransaction = {
  id: string;
  label: string;
  status: RelationshipTaskTransactionStatus;
  txHash: string | null;
  error: string | null;
};

export type RelationshipExecutionTask = {
  id: string;
  walletId: string;
  inviterId: string | null;
  level: number;
  status: RelationshipTaskStatus;
  txHash: string | null;
  error: string | null;
  transactions: RelationshipTaskTransaction[];
};

export type RelationshipValidationResult = {
  ok: boolean;
  errors: string[];
};

export type RelationshipTreeNode = {
  wallet: RelationshipWallet;
  level: number;
  children: RelationshipTreeNode[];
};

export type RelationshipGraphNode = {
  wallet: RelationshipWallet;
  level: number;
  x: number;
  y: number;
};

export type RelationshipGraphEdge = {
  fromWalletId: string;
  toWalletId: string;
};

export type RelationshipGraphLayout = {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
};

export type RelationshipGraphLayoutOptions = {
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalGap?: number;
  verticalGap?: number;
  padding?: number;
};

export type RelationshipFunctionOption = {
  name: string;
  signature: string;
  inputs: AbiInputParam[];
  stateMutability: string;
};

export type BuildRelationshipCallArgsInput = {
  fn: RelationshipFunctionOption;
  inviterInputIndex: number;
  fixedInputs: Record<number, string>;
  fixedUnits?: Record<number, IntegerUnit>;
  inviterAddress: string;
};

export type SplitRelationshipWalletsResult = {
  graphWallets: RelationshipWallet[];
  availableWallets: RelationshipWallet[];
};

const csvCell = (value: string) => {
  if (!/[",\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
};

export const shortRelationshipAddress = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

export const buildWalletLabel = (wallet: RelationshipWallet) =>
  `Wallet #${wallet.id.replace(/^wallet-/, "")}`;

export const relationMapOf = (relations: RelationshipRelation[]) => {
  const relationMap = new Map<string, string>();
  relations.forEach((relation) => {
    relationMap.set(relation.walletId, relation.inviterId);
  });
  return relationMap;
};

export const validateRelationships = (
  wallets: RelationshipWallet[],
  relations: RelationshipRelation[],
): RelationshipValidationResult => {
  const errors: string[] = [];
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const addressOwner = new Map<string, string>();

  wallets.forEach((wallet) => {
    if (!isAddress(wallet.address)) {
      errors.push(`${wallet.id} 地址格式无效`);
      return;
    }
    const key = wallet.address.toLowerCase();
    const duplicateOwner = addressOwner.get(key);
    if (duplicateOwner) {
      errors.push(`${wallet.id} 与 ${duplicateOwner} 地址重复`);
    } else {
      addressOwner.set(key, wallet.id);
    }
  });

  const inviterByWallet = new Map<string, string>();
  relations.forEach((relation) => {
    if (!walletById.has(relation.walletId)) {
      errors.push(`${relation.walletId} 不在钱包列表中`);
      return;
    }
    if (!walletById.has(relation.inviterId)) {
      errors.push(`${relation.inviterId} 不在钱包列表中`);
      return;
    }
    if (relation.walletId === relation.inviterId) {
      errors.push(`${relation.walletId} 不能绑定自己`);
      return;
    }
    const existing = inviterByWallet.get(relation.walletId);
    if (existing && existing !== relation.inviterId) {
      errors.push(`${relation.walletId} 存在多个上级`);
      return;
    }
    inviterByWallet.set(relation.walletId, relation.inviterId);
  });

  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (walletId: string, path: string[]) => {
    if (visiting.has(walletId)) {
      const cycleStart = path.indexOf(walletId);
      const cyclePath = path.slice(cycleStart).join(" -> ");
      errors.push(`存在循环关系：${cyclePath}`);
      return;
    }
    if (visited.has(walletId)) {
      return;
    }

    visiting.add(walletId);
    const inviterId = inviterByWallet.get(walletId);
    if (inviterId) {
      visit(inviterId, [...path, inviterId]);
    }
    visiting.delete(walletId);
    visited.add(walletId);
  };

  wallets.forEach((wallet) => visit(wallet.id, [wallet.id]));

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
};

const levelOfWallet = (
  walletId: string,
  relationMap: Map<string, string>,
  memo: Map<string, number>,
): number => {
  const known = memo.get(walletId);
  if (known !== undefined) {
    return known;
  }
  const inviterId = relationMap.get(walletId);
  const level = inviterId ? levelOfWallet(inviterId, relationMap, memo) + 1 : 0;
  memo.set(walletId, level);
  return level;
};

export const buildExecutionPlan = (
  wallets: RelationshipWallet[],
  relations: RelationshipRelation[],
): RelationshipExecutionTask[] => {
  const validation = validateRelationships(wallets, relations);
  if (!validation.ok) {
    throw new Error(validation.errors.join("\n"));
  }

  const walletOrder = new Map(wallets.map((wallet, index) => [wallet.id, index]));
  const relationMap = relationMapOf(relations);
  const levelMemo = new Map<string, number>();

  return wallets
    .map((wallet) => ({
      id: `task-${wallet.id}`,
      walletId: wallet.id,
      inviterId: relationMap.get(wallet.id) ?? null,
      level: levelOfWallet(wallet.id, relationMap, levelMemo),
      status: "pending" as const,
      txHash: null,
      error: null,
      transactions: [],
    }))
    .sort((left, right) => {
      if (left.level !== right.level) {
        return left.level - right.level;
      }
      return (walletOrder.get(left.walletId) ?? 0) - (walletOrder.get(right.walletId) ?? 0);
    });
};

export const buildRelationshipForest = (
  wallets: RelationshipWallet[],
  relations: RelationshipRelation[],
): RelationshipTreeNode[] => {
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const relationMap = relationMapOf(relations);
  const childrenByInviter = new Map<string, RelationshipWallet[]>();

  relations.forEach((relation) => {
    const wallet = walletById.get(relation.walletId);
    if (!wallet || !walletById.has(relation.inviterId)) {
      return;
    }
    childrenByInviter.set(relation.inviterId, [
      ...(childrenByInviter.get(relation.inviterId) || []),
      wallet,
    ]);
  });

  const walletOrder = new Map(wallets.map((wallet, index) => [wallet.id, index]));
  childrenByInviter.forEach((children, inviterId) => {
    childrenByInviter.set(
      inviterId,
      [...children].sort(
        (left, right) =>
          (walletOrder.get(left.id) ?? 0) - (walletOrder.get(right.id) ?? 0),
      ),
    );
  });

  const buildNode = (
    wallet: RelationshipWallet,
    level: number,
    path: Set<string>,
  ): RelationshipTreeNode => {
    if (path.has(wallet.id)) {
      return { wallet, level, children: [] };
    }
    const nextPath = new Set(path);
    nextPath.add(wallet.id);
    return {
      wallet,
      level,
      children: (childrenByInviter.get(wallet.id) || []).map((child) =>
        buildNode(child, level + 1, nextPath),
      ),
    };
  };

  return wallets
    .filter((wallet) => !relationMap.has(wallet.id))
    .map((wallet) => buildNode(wallet, 0, new Set()));
};

export const buildRelationshipGraphLayout = (
  wallets: RelationshipWallet[],
  relations: RelationshipRelation[],
  options: RelationshipGraphLayoutOptions = {},
): RelationshipGraphLayout => {
  const nodeWidth = options.nodeWidth ?? 208;
  const nodeHeight = options.nodeHeight ?? 78;
  const horizontalGap = options.horizontalGap ?? 44;
  const verticalGap = options.verticalGap ?? 84;
  const padding = options.padding ?? 24;
  const forest = buildRelationshipForest(wallets, relations);
  const nodes: RelationshipGraphNode[] = [];
  const edges: RelationshipGraphEdge[] = [];
  let leafCursor = 0;
  let maxLevel = 0;

  const visit = (node: RelationshipTreeNode): number => {
    maxLevel = Math.max(maxLevel, node.level);
    const childCenters = node.children.map((child) => {
      edges.push({ fromWalletId: node.wallet.id, toWalletId: child.wallet.id });
      return visit(child);
    });
    const center =
      childCenters.length > 0
        ? (childCenters[0] + childCenters[childCenters.length - 1]) / 2
        : padding + nodeWidth / 2 + leafCursor++ * (nodeWidth + horizontalGap);
    nodes.push({
      wallet: node.wallet,
      level: node.level,
      x: center - nodeWidth / 2,
      y: padding + node.level * (nodeHeight + verticalGap),
    });
    return center;
  };

  forest.forEach(visit);

  const maxRight = nodes.reduce(
    (right, node) => Math.max(right, node.x + nodeWidth),
    padding,
  );

  return {
    width: Math.max(maxRight + padding, padding * 2 + nodeWidth),
    height: padding * 2 + nodeHeight + maxLevel * (nodeHeight + verticalGap),
    nodeWidth,
    nodeHeight,
    nodes,
    edges,
  };
};

export const splitGraphAndAvailableWallets = (
  wallets: RelationshipWallet[],
  relations: RelationshipRelation[],
): SplitRelationshipWalletsResult => {
  const graphWalletIds = new Set<string>();
  relations.forEach((relation) => {
    graphWalletIds.add(relation.walletId);
    graphWalletIds.add(relation.inviterId);
  });

  if (graphWalletIds.size === 0 && wallets[0]) {
    graphWalletIds.add(wallets[0].id);
  }

  return {
    graphWallets: wallets.filter((wallet) => graphWalletIds.has(wallet.id)),
    availableWallets: wallets.filter((wallet) => !graphWalletIds.has(wallet.id)),
  };
};

export const exportRelationshipTxt = (wallets: RelationshipWallet[]) =>
  wallets.map((wallet) => wallet.address).join("\n");

export const exportRelationshipCsv = (
  wallets: RelationshipWallet[],
  relations: RelationshipRelation[],
) => {
  const relationMap = relationMapOf(relations);
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const hasRelations = relations.length > 0;
  const header = hasRelations ? "index,address,inviter" : "index,address";
  const rows = wallets.map((wallet, index) => {
    const inviter = relationMap.get(wallet.id);
    const inviterAddress = inviter ? walletById.get(inviter)?.address ?? inviter : "ROOT";
    const cells = hasRelations
      ? [String(index + 1), wallet.address, inviterAddress]
      : [String(index + 1), wallet.address];
    return cells.map(csvCell).join(",");
  });
  return [header, ...rows].join("\n");
};

export const getAddressFunctionOptions = (abiText: string) => {
  const iface = new Interface(abiText);
  return iface.fragments
    .filter((fragment): fragment is FunctionFragment => fragment.type === "function")
    .filter(
      (fragment) =>
        fragment.inputs.some((input) => input.baseType === "address") &&
        fragment.stateMutability !== "view" &&
        fragment.stateMutability !== "pure",
    )
    .map((fragment) => ({
      name: fragment.name,
      signature: fragment.format("sighash"),
      inputs: fragment.inputs.map(serializeParamType),
      stateMutability: fragment.stateMutability,
    }));
};

export const buildRelationshipCallArgs = ({
  fn,
  inviterInputIndex,
  fixedInputs,
  fixedUnits = {},
  inviterAddress,
}: BuildRelationshipCallArgsInput) =>
  fn.inputs.map((input, index) =>
    index === inviterInputIndex
      ? parseArgumentValue(input, inviterAddress)
      : parseArgumentValue(input, fixedInputs[index] ?? "", fixedUnits[index] ?? "wei"),
  );
