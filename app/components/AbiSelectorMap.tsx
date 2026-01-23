"use client";

import { useEffect, useMemo, useState } from "react";
import { EventFragment, FunctionFragment, Interface } from "ethers";

type SavedAbi = { name: string; abi: string };

type SelectorEntry = {
  name: string;
  signature: string;
  selector: string;
};

type TopicEntry = {
  name: string;
  signature: string;
  topic0: string;
};

const ABI_LIST_KEY = "abiList";
const CURRENT_ABI_KEY = "currentAbi";

const safeJsonParse = <T,>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const resolveAbiArray = (raw: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "ABI JSON 解析失败" } as const;
  }

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { error: "ABI JSON 解析失败" } as const;
    }
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if ("abi" in record) {
      parsed = record.abi;
    } else if ("result" in record) {
      parsed = record.result;
    }
  }

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { error: "ABI JSON 解析失败" } as const;
    }
  }

  if (!Array.isArray(parsed)) {
    return { error: "ABI 需要是数组格式" } as const;
  }

  return { abi: parsed } as const;
};

const AbiSelectorMap = () => {
  const [savedAbis, setSavedAbis] = useState<Array<SavedAbi>>([]);
  const [selectedAbiIndex, setSelectedAbiIndex] = useState<number | null>(null);
  const [abi, setAbi] = useState("");
  const [functionQuery, setFunctionQuery] = useState("");
  const [eventQuery, setEventQuery] = useState("");

  useEffect(() => {
    const savedAbiList = safeJsonParse<Array<SavedAbi>>(
      localStorage.getItem(ABI_LIST_KEY) || "[]",
      [],
    );
    const currentAbi = localStorage.getItem(CURRENT_ABI_KEY) || "";

    setSavedAbis(savedAbiList);
    setAbi(currentAbi);
    if (currentAbi) {
      const idx = savedAbiList.findIndex((item) => item.abi === currentAbi);
      setSelectedAbiIndex(idx >= 0 ? idx : null);
    }
  }, []);

  const handleSelectAbi = (indexValue: string) => {
    if (!indexValue) {
      setSelectedAbiIndex(null);
      setAbi("");
      localStorage.removeItem(CURRENT_ABI_KEY);
      return;
    }

    const index = Number(indexValue);
    const selected = savedAbis[index];
    if (!selected) {
      return;
    }
    setSelectedAbiIndex(index);
    setAbi(selected.abi);
    localStorage.setItem(CURRENT_ABI_KEY, selected.abi);
  };

  const { functionEntries, eventEntries, errorMessage } = useMemo(() => {
    if (!abi.trim()) {
      return {
        functionEntries: [] as SelectorEntry[],
        eventEntries: [] as TopicEntry[],
        errorMessage: "请先选择 ABI",
      };
    }

    const resolved = resolveAbiArray(abi);
    if ("error" in resolved) {
      return {
        functionEntries: [] as SelectorEntry[],
        eventEntries: [] as TopicEntry[],
        errorMessage: resolved.error,
      };
    }

    try {
      const iface = new Interface(resolved.abi);
      const functionEntries = iface.fragments
        .filter((fragment): fragment is FunctionFragment => fragment.type === "function")
        .map((fragment) => ({
          name: fragment.name,
          signature: fragment.format("sighash"),
          selector: fragment.selector,
        }));

      const eventEntries = iface.fragments
        .filter((fragment): fragment is EventFragment => fragment.type === "event")
        .map((fragment) => ({
          name: fragment.name,
          signature: fragment.format("sighash"),
          topic0: fragment.topicHash,
        }));

      return {
        functionEntries,
        eventEntries,
        errorMessage: "",
      };
    } catch (error) {
      return {
        functionEntries: [] as SelectorEntry[],
        eventEntries: [] as TopicEntry[],
        errorMessage: "ABI 解析失败：" + (error as Error).message,
      };
    }
  }, [abi]);

  const filteredFunctionEntries = useMemo(() => {
    const query = functionQuery.trim().toLowerCase();
    if (!query) {
      return functionEntries;
    }
    return functionEntries.filter((entry) => {
      return (
        entry.name.toLowerCase().includes(query) ||
        entry.signature.toLowerCase().includes(query) ||
        entry.selector.toLowerCase().includes(query)
      );
    });
  }, [functionEntries, functionQuery]);

  const filteredEventEntries = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    if (!query) {
      return eventEntries;
    }
    return eventEntries.filter((entry) => {
      return (
        entry.name.toLowerCase().includes(query) ||
        entry.signature.toLowerCase().includes(query) ||
        entry.topic0.toLowerCase().includes(query)
      );
    });
  }, [eventEntries, eventQuery]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          Selector 与 Topic0 对照
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          选择已保存的 ABI，快速查看全部方法的 selector 与事件的 topic0。
        </p>
      </div>

      <div className="fade-up-delay space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">选择已保存 ABI</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              {savedAbis.length} 个
            </span>
          </div>
          {savedAbis.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              暂无 ABI，请先前往 ABI 管理页面添加。
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  ABI 列表
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={selectedAbiIndex === null ? "" : String(selectedAbiIndex)}
                  onChange={(e) => handleSelectAbi(e.target.value)}
                >
                  <option value="">请选择 ABI</option>
                  {savedAbis.map((item, index) => (
                    <option key={`${item.name}-${index}`} value={index}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  当前 ABI
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {selectedAbiIndex === null
                    ? "未选择"
                    : savedAbis[selectedAbiIndex]?.name}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">方法 Selector</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={functionQuery}
                onChange={(event) => setFunctionQuery(event.target.value)}
                placeholder="搜索方法/签名/selector"
                className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                {filteredFunctionEntries.length} 个
              </span>
            </div>
          </div>
          {errorMessage ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : functionEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              当前 ABI 未包含方法定义。
            </div>
          ) : filteredFunctionEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              未找到匹配的 selector。
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">方法</th>
                    <th className="px-3 py-2">签名</th>
                    <th className="px-3 py-2">Selector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFunctionEntries.map((entry, index) => (
                    <tr key={`${entry.signature}-${index}`} className="text-slate-600">
                      <td className="px-3 py-3 font-medium text-slate-700">
                        {entry.name}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">
                        {entry.signature}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">
                        {entry.selector}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">事件 Topic0</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={eventQuery}
                onChange={(event) => setEventQuery(event.target.value)}
                placeholder="搜索事件/签名/topic0"
                className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                {filteredEventEntries.length} 个
              </span>
            </div>
          </div>
          {errorMessage ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : eventEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              当前 ABI 未包含事件定义。
            </div>
          ) : filteredEventEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              未找到匹配的 topic0。
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">事件</th>
                    <th className="px-3 py-2">签名</th>
                    <th className="px-3 py-2">Topic0</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEventEntries.map((entry, index) => (
                    <tr key={`${entry.signature}-${index}`} className="text-slate-600">
                      <td className="px-3 py-3 font-medium text-slate-700">
                        {entry.name}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">
                        {entry.signature}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">
                        {entry.topic0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AbiSelectorMap;
