"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import {
  JsonRpcProvider,
  getAddress,
  isAddress,
  keccak256,
  toBeHex,
  zeroPadValue,
} from "ethers";
import {
  decodeLongStorageBytes,
  decodeStorageValue,
  getLongStorageBytesLength,
  getLongStorageBytesSlotCount,
  isLongStorageBytes,
  parseStorageLayout,
  resolveStoragePath,
  type StorageEntry,
  type StorageLayout as ParsedStorageLayout,
  type StoragePathSegment,
} from "./storage-layout-utils";

const ensureRpcUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入 Chain RPC");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Chain RPC 需要是 http(s) URL");
    }
    return trimmed;
  } catch (error) {
    if (error instanceof Error && error.message === "Chain RPC 需要是 http(s) URL") {
      throw error;
    }
    throw new Error("请输入有效的 Chain RPC URL");
  }
};

const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入合约地址");
  }
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!isAddress(withPrefix)) {
    throw new Error("请输入有效的合约地址");
  }
  return getAddress(withPrefix);
};

const extractErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "读取失败，请检查 RPC、地址和参数";

type ReadResult = {
  decoded: string;
  path: string;
  raw: string;
  slot: string;
};

type SlotInputSpec = {
  id: string;
  kind: "arrayIndex" | "mappingKey";
  label: string;
};

type SegmentTemplate =
  | StoragePathSegment
  | {
      inputId: string;
      kind: "arrayIndex" | "mappingKey";
    };

type SlotReadTarget = {
  label: string;
  segments: SegmentTemplate[];
};

type SlotReadPlan = {
  inputs: SlotInputSpec[];
  structDescriptions: string[];
  targets: SlotReadTarget[];
};

type RowReadState = {
  error?: string;
  inputs: Record<string, string>;
  isLoading?: boolean;
  results?: ReadResult[];
};

const isStructType = (type: ParsedStorageLayout["types"][string]) =>
  type.encoding === "inplace" && Array.isArray(type.members);

const isStaticArrayType = (type: ParsedStorageLayout["types"][string]) =>
  type.encoding === "inplace" && Boolean(type.base) && /\[\d+\]$/.test(type.label);

const lastPathPart = (value: string) => {
  const parts = value.split(".");
  return parts[parts.length - 1] || value;
};

const describeStructType = (
  layout: ParsedStorageLayout,
  typeId: string,
  seen: Set<string> = new Set(),
) => {
  if (seen.has(typeId)) {
    return "";
  }
  seen.add(typeId);

  const type = layout.types[typeId];
  if (!type || !isStructType(type)) {
    return "";
  }

  const members = type.members
    ?.map((member) => {
      const memberType = layout.types[member.type];
      return `${member.label}: ${memberType?.label ?? member.type}`;
    })
    .join("; ");

  return `${type.label} { ${members ?? ""} }`;
};

const targetInputIds = (target: SlotReadTarget) =>
  target.segments
    .filter((segment): segment is Extract<SegmentTemplate, { inputId: string }> =>
      "inputId" in segment,
    )
    .map((segment) => segment.inputId);

const isTargetReady = (
  target: SlotReadTarget,
  inputs: Record<string, string>,
) => targetInputIds(target).every((inputId) => inputs[inputId]?.trim());

const buildReadPlan = (
  layout: ParsedStorageLayout,
  entry: StorageEntry,
): SlotReadPlan => {
  const inputs: SlotInputSpec[] = [];
  const structDescriptions: string[] = [];
  const targets: SlotReadTarget[] = [];

  const walk = (
    typeId: string,
    label: string,
    segments: SegmentTemplate[],
    depth: number,
    mappingDepth: number,
    isStructField: boolean,
  ) => {
    if (depth > 8) {
      targets.push({ label, segments });
      return;
    }

    const type = layout.types[typeId];
    if (!type) {
      targets.push({ label, segments });
      return;
    }

    if (type.encoding === "mapping" && type.value) {
      const inputId = `${entry.label}-${inputs.length}`;
      const keyType = type.key ? layout.types[type.key] : null;
      const inputLabel = isStructField
        ? `${lastPathPart(label)} key (${keyType?.label ?? type.key ?? "key"})`
        : `${entry.label} key ${mappingDepth + 1} (${keyType?.label ?? type.key ?? "key"})`;
      inputs.push({
        id: inputId,
        kind: "mappingKey",
        label: inputLabel,
      });
      walk(
        type.value,
        label,
        [...segments, { inputId, kind: "mappingKey" }],
        depth + 1,
        mappingDepth + 1,
        isStructField,
      );
      return;
    }

    if ((type.encoding === "dynamic_array" || isStaticArrayType(type)) && type.base) {
      const inputId = `${entry.label}-${inputs.length}`;
      inputs.push({
        id: inputId,
        kind: "arrayIndex",
        label: `${label} index`,
      });
      walk(
        type.base,
        label,
        [...segments, { inputId, kind: "arrayIndex" }],
        depth + 1,
        mappingDepth,
        isStructField,
      );
      return;
    }

    if (isStructType(type)) {
      const description = describeStructType(layout, typeId);
      if (description && !structDescriptions.includes(description)) {
        structDescriptions.push(description);
      }
      type.members?.forEach((member) => {
        walk(
          member.type,
          `${label}.${member.label}`,
          [...segments, { kind: "structField", value: member.label }],
          depth + 1,
          0,
          true,
        );
      });
      return;
    }

    targets.push({ label, segments });
  };

  walk(entry.type, entry.label, [], 0, 0, false);
  return { inputs, structDescriptions, targets };
};

const StorageLayout = () => {
  const [rpcUrl, setRpcUrl] = useState("");
  const [contractInput, setContractInput] = useState("");
  const [layoutInput, setLayoutInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [isDraggingLayoutFile, setIsDraggingLayoutFile] = useState(false);
  const [rowStates, setRowStates] = useState<Record<string, RowReadState>>({});

  const parsedLayout = useMemo<ParsedStorageLayout | null>(() => {
    if (!layoutInput.trim()) {
      return null;
    }
    try {
      return parseStorageLayout(layoutInput);
    } catch {
      return null;
    }
  }, [layoutInput]);

  const parseError = useMemo(() => {
    if (!layoutInput.trim()) {
      return "";
    }
    try {
      parseStorageLayout(layoutInput);
      return "";
    } catch (error) {
      return extractErrorMessage(error);
    }
  }, [layoutInput]);

  const resetPath = () => {
    setRowStates({});
    setErrorMessage("");
  };

  const loadLayoutFile = async (file: File) => {
    setLayoutInput(await file.text());
    resetPath();
  };

  const handleLayoutFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await loadLayoutFile(file);
    event.target.value = "";
  };

  const handleLayoutDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingLayoutFile(true);
  };

  const handleLayoutDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingLayoutFile(false);
    }
  };

  const handleLayoutDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingLayoutFile(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    await loadLayoutFile(file);
  };

  const setRowInput = (entryLabel: string, inputId: string, value: string) => {
    setRowStates((current) => ({
      ...current,
      [entryLabel]: {
        inputs: {
          ...(current[entryLabel]?.inputs ?? {}),
          [inputId]: value,
        },
      },
    }));
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label}已复制`);
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  const readEntry = async (entry: StorageEntry, plan: SlotReadPlan) => {
    const currentInputs = rowStates[entry.label]?.inputs ?? {};
    setRowStates((current) => ({
      ...current,
      [entry.label]: {
        inputs: currentInputs,
        isLoading: true,
      },
    }));
    setErrorMessage("");
    setCopyMessage("");

    try {
      if (!parsedLayout) {
        throw new Error("请先解析 storage-layout");
      }

      const normalizedRpcUrl = ensureRpcUrl(rpcUrl);
      const contractAddress = normalizeAddressInput(contractInput);
      const provider = new JsonRpcProvider(normalizedRpcUrl);
      const readableTargets = plan.targets.filter((target) =>
        isTargetReady(target, currentInputs),
      );
      if (readableTargets.length === 0) {
        throw new Error("请先填写当前变量需要的 key / index");
      }
      const results = await Promise.all(
        readableTargets.map(async (target) => {
          const segments = target.segments.map((segment) => {
            if ("inputId" in segment) {
              const value = currentInputs[segment.inputId]?.trim();
              return { kind: segment.kind, value } as StoragePathSegment;
            }
            return segment;
          });

          const finalPath = resolveStoragePath(parsedLayout, entry.label, segments);
          const raw = await provider.getStorage(contractAddress, finalPath.slot);
          let decoded = decodeStorageValue(parsedLayout, finalPath, raw);

          const finalType = parsedLayout.types[finalPath.typeId];
          if (finalType?.encoding === "bytes" && isLongStorageBytes(raw)) {
            const length = getLongStorageBytesLength(raw);
            const dataSlot = BigInt(keccak256(zeroPadValue(finalPath.slot, 32)));
            const slotsToRead = getLongStorageBytesSlotCount(length);
            const words = await Promise.all(
              Array.from({ length: slotsToRead }, (_, index) =>
                provider.getStorage(contractAddress, toBeHex(dataSlot + BigInt(index), 32)),
              ),
            );
            decoded = decodeLongStorageBytes(words, length, finalType.label === "string");
          }

          return {
            decoded,
            path: finalPath.path,
            raw,
            slot: finalPath.slot,
          };
        }),
      );

      setRowStates((current) => ({
        ...current,
        [entry.label]: {
          inputs: currentInputs,
          results,
        },
      }));
    } catch (error) {
      setRowStates((current) => ({
        ...current,
        [entry.label]: {
          error: extractErrorMessage(error),
          inputs: currentInputs,
        },
      }));
    }
  };

  const clearEntryResult = (entryLabel: string) => {
    setRowStates((current) => {
      const next = { ...current };
      next[entryLabel] = {
        inputs: current[entryLabel]?.inputs ?? {},
      };
      return next;
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          StorageLayout
        </h1>
        <p className="max-w-3xl text-sm text-slate-600 md:text-base">
          粘贴 Solidity storage-layout.json，通过 RPC 直接读取 internal/private 状态。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">输入</h2>
            <p className="mt-1 text-sm text-slate-500">
              RPC、合约地址和 storage layout 都只保存在当前页面状态里。
            </p>
          </div>
          <label className="w-fit cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900">
            上传 JSON
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleLayoutFile}
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Chain RPC
            </label>
            <input
              type="url"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={rpcUrl}
              onChange={(event) => setRpcUrl(event.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              合约地址
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={contractInput}
              onChange={(event) => setContractInput(event.target.value)}
              placeholder="0x..."
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            storage-layout.json
          </label>
          <div
            className={`rounded-2xl border-2 border-dashed p-2 transition ${
              isDraggingLayoutFile
                ? "border-slate-900 bg-slate-100"
                : "border-slate-200 bg-slate-50"
            }`}
            onDragEnter={handleLayoutDragOver}
            onDragOver={handleLayoutDragOver}
            onDragLeave={handleLayoutDragLeave}
            onDrop={handleLayoutDrop}
          >
            <div className="mb-2 flex flex-col gap-1 px-2 pt-1 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
              <span>拖拽 storage-layout.json 到这里，或直接粘贴 JSON。</span>
              {isDraggingLayoutFile && (
                <span className="font-semibold text-slate-900">松开即可导入</span>
              )}
            </div>
            <textarea
              className="min-h-72 w-full resize-y rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-slate-100 shadow-sm focus:border-slate-400 focus:outline-none"
              value={layoutInput}
              onChange={(event) => {
                setLayoutInput(event.target.value);
                resetPath();
              }}
              placeholder='{"storage":[...],"types":{...}}'
            />
          </div>
          {parseError && (
            <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {parseError}
            </div>
          )}
        </div>
      </section>

      {parsedLayout && (
        <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">读取路径</h2>
              <p className="mt-1 text-sm text-slate-500">
                已解析 {parsedLayout.storage.length} 个 storage 变量。
              </p>
            </div>
            <button
              type="button"
              className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
              onClick={resetPath}
            >
              重置路径
            </button>
          </div>

          <div>
            <div className="mb-2 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <label className="block text-sm font-medium text-slate-700">
                存储卡槽
              </label>
              <span className="text-xs text-slate-500">
                每个变量独立输入参数和显示结果。
              </span>
            </div>
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
              {parsedLayout.storage.map((entry) => {
                const type = parsedLayout.types[entry.type];
                const plan = buildReadPlan(parsedLayout, entry);
                const rowState = rowStates[entry.label] ?? { inputs: {} };
                const hasReadableTarget = plan.targets.some((target) =>
                  isTargetReady(target, rowState.inputs),
                );

                return (
                  <div
                    key={`${entry.label}-${entry.slot}-${entry.offset}`}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="grid gap-3 md:grid-cols-[minmax(150px,0.8fr)_minmax(220px,1.3fr)_90px_90px_auto] md:items-center">
                      <span className="break-all font-mono text-sm font-semibold text-slate-800">
                        {entry.label}
                      </span>
                      <span className="break-all text-xs text-slate-500">
                        {type?.label ?? entry.type}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
                        slot {entry.slot}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
                        offset {entry.offset}
                      </span>
                      <button
                        type="button"
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        onClick={() => readEntry(entry, plan)}
                        disabled={rowState.isLoading || !hasReadableTarget}
                      >
                        {rowState.isLoading ? "读取中..." : "读取"}
                      </button>
                    </div>

                    {plan.structDescriptions.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Struct
                        </div>
                        <div className="grid gap-2">
                          {plan.structDescriptions.map((description) => (
                            <div
                              key={description}
                              className="break-all font-mono text-xs leading-5 text-slate-700"
                            >
                              {description}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {plan.inputs.length > 0 && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {plan.inputs.map((input) => (
                          <div key={input.id}>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              {input.label}
                            </label>
                            <input
                              type={input.kind === "arrayIndex" ? "number" : "text"}
                              min={input.kind === "arrayIndex" ? 0 : undefined}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                              value={rowState.inputs[input.id] ?? ""}
                              onChange={(event) =>
                                setRowInput(entry.label, input.id, event.target.value)
                              }
                              placeholder={input.kind === "arrayIndex" ? "0" : "输入 key"}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {rowState.error && (
                      <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {rowState.error}
                      </div>
                    )}

                    {rowState.results && rowState.results.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Result
                          </span>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                            onClick={() => clearEntryResult(entry.label)}
                          >
                            清除
                          </button>
                        </div>
                        <div className="grid gap-3">
                          {rowState.results.map((item) => (
                            <div
                              key={`${item.path}-${item.slot}`}
                              className="rounded-xl border border-slate-200 bg-white p-3"
                            >
                              <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="break-all font-mono text-xs font-semibold text-slate-700">
                                  {item.path}
                                </div>
                                <button
                                  type="button"
                                  className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                                  onClick={() => copyValue(item.decoded, "解码值")}
                                >
                                  复制
                                </button>
                              </div>
                              <div className="grid gap-2 text-xs md:grid-cols-[90px_minmax(0,1fr)]">
                                <span className="font-semibold text-slate-500">Slot</span>
                                <span className="break-all font-mono text-slate-700">{item.slot}</span>
                                <span className="font-semibold text-slate-500">Raw</span>
                                <span className="break-all font-mono text-slate-700">{item.raw}</span>
                                <span className="font-semibold text-slate-500">Decoded</span>
                                <span className="break-all font-mono text-slate-900">{item.decoded}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {errorMessage && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </div>
              )}
              {copyMessage && <div className="text-xs text-slate-500">{copyMessage}</div>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default StorageLayout;
