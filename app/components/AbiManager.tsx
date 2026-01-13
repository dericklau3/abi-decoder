"use client";

import { useEffect, useState } from "react";

type SavedAbi = { name: string; abi: string };

const ABI_LIST_KEY = "abiList";
const CURRENT_ABI_KEY = "currentAbi";

const safeJsonParse = <T,>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeAbiInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { abiText: "", error: "请输入 ABI 内容" };
  }

  const parseJson = (input: string) => {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  };

  let parsed = parseJson(trimmed);
  if (typeof parsed === "string") {
    parsed = parseJson(parsed);
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if ("abi" in record) {
      parsed = record.abi;
    } else if ("result" in record) {
      const resultValue = record.result;
      if (typeof resultValue === "string") {
        parsed = parseJson(resultValue) ?? resultValue;
      } else {
        parsed = resultValue;
      }
    }
  }

  if (parsed !== null && parsed !== undefined && parsed !== trimmed) {
    if (typeof parsed === "string") {
      return { abiText: parsed };
    }
    return { abiText: JSON.stringify(parsed, null, 2) };
  }

  return { abiText: trimmed };
};

const AbiManager = () => {
  const [savedAbis, setSavedAbis] = useState<Array<SavedAbi>>([]);
  const [abiName, setAbiName] = useState("");
  const [abiInput, setAbiInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const savedAbiList = safeJsonParse<Array<SavedAbi>>(
      localStorage.getItem(ABI_LIST_KEY) || "[]",
      [],
    );
    const currentAbi = localStorage.getItem(CURRENT_ABI_KEY) || "";
    setSavedAbis(savedAbiList);
    setAbiInput(currentAbi);
    if (currentAbi) {
      const idx = savedAbiList.findIndex((item) => item.abi === currentAbi);
      setSelectedIndex(idx >= 0 ? idx : null);
      if (idx >= 0) {
        setAbiName(savedAbiList[idx].name);
      }
    }
  }, []);

  const persistAbiList = (abiList: Array<SavedAbi>, current?: string) => {
    setSavedAbis(abiList);
    localStorage.setItem(ABI_LIST_KEY, JSON.stringify(abiList));
    if (current !== undefined) {
      localStorage.setItem(CURRENT_ABI_KEY, current);
    }
  };

  const resetSelection = () => {
    setSelectedIndex(null);
    setAbiName("");
    setAbiInput("");
    localStorage.removeItem(CURRENT_ABI_KEY);
  };

  const handleSelect = (index: number) => {
    const selected = savedAbis[index];
    if (!selected) {
      return;
    }
    setSelectedIndex(index);
    setAbiName(selected.name);
    setAbiInput(selected.abi);
    localStorage.setItem(CURRENT_ABI_KEY, selected.abi);
  };

  const handleSave = () => {
    setErrorMessage("");
    if (!abiName.trim()) {
      setErrorMessage("请输入 ABI 名称与内容");
      return;
    }
    const { abiText, error } = normalizeAbiInput(abiInput);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setAbiInput(abiText);
    const nextItem = { name: abiName.trim(), abi: abiText };
    if (selectedIndex !== null && savedAbis[selectedIndex]) {
      const nextList = savedAbis.map((item, idx) =>
        idx === selectedIndex ? nextItem : item,
      );
      persistAbiList(nextList, nextItem.abi);
      return;
    }
    const nextList = [...savedAbis, nextItem];
    persistAbiList(nextList, nextItem.abi);
    setSelectedIndex(nextList.length - 1);
  };

  const handleSaveAsNew = () => {
    setErrorMessage("");
    if (!abiName.trim()) {
      setErrorMessage("请输入 ABI 名称与内容");
      return;
    }
    const { abiText, error } = normalizeAbiInput(abiInput);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setAbiInput(abiText);
    const nextItem = { name: abiName.trim(), abi: abiText };
    const nextList = [...savedAbis, nextItem];
    persistAbiList(nextList, nextItem.abi);
    setSelectedIndex(nextList.length - 1);
  };

  const handleDelete = (index: number) => {
    const nextList = savedAbis.filter((_, idx) => idx !== index);
    persistAbiList(nextList);
    if (selectedIndex === index) {
      resetSelection();
    } else if (selectedIndex !== null && index < selectedIndex) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const { abiText } = normalizeAbiInput(text);
      if (!abiText) {
        setErrorMessage("文件解析失败：无法识别 ABI 内容");
        return;
      }
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      const nextList = [...savedAbis, { name: fileName, abi: abiText }];
      persistAbiList(nextList, abiText);
      setAbiName(fileName);
      setAbiInput(abiText);
      setSelectedIndex(nextList.length - 1);
    } catch (err) {
      setErrorMessage("文件解析失败：" + (err as Error).message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          ABI 管理
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          统一维护 ABI 列表，供交易解码与合约交互页面直接选择使用。
        </p>
      </div>

      <div className="fade-up-delay grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-[0_16px_45px_-30px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">已保存 ABI</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
              {savedAbis.length}
            </span>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            拖拽 JSON 文件到右侧区域即可自动保存。
          </p>
          <div className="space-y-2">
            {(savedAbis || []).map((savedAbi, index) => (
              <div
                key={`abi-${index}`}
                className={`group flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-2 transition ${
                  selectedIndex === index
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white"
                }`}
                onClick={() => handleSelect(index)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleSelect(index);
                  }
                }}
              >
                <span
                  className={`text-left text-sm font-medium transition ${
                    selectedIndex === index
                      ? "text-white"
                      : "text-slate-700 group-hover:text-slate-900"
                  }`}
                >
                  {savedAbi.name}
                </span>
                <button
                  type="button"
                  className={`text-sm transition ${
                    selectedIndex === index
                      ? "text-white/70 hover:text-white"
                      : "text-slate-400 hover:text-rose-500"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(index);
                  }}
                  aria-label={`删除 ${savedAbi.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            {savedAbis.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                暂无保存的 ABI
              </div>
            )}
          </div>
        </aside>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">共用 ABI</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              Shared ABI
            </span>
          </div>
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                ABI 名称
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={abiName}
                onChange={(e) => setAbiName(e.target.value)}
                placeholder="例如 ERC20"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                合约 ABI
              </label>
              <div
                className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 transition hover:border-slate-300"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <textarea
                  className="h-40 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={abiInput}
                  onChange={(e) => setAbiInput(e.target.value)}
                  placeholder="请输入合约 ABI (JSON 格式)，支持 Etherscan ABI / API 返回，或拖拽 JSON 文件到此处"
                />
                <p className="mt-2 text-xs text-slate-400">
                  支持拖拽 ABI JSON 文件，自动解析并保存到左侧列表。
                </p>
              </div>
            </div>
          </div>
          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              onClick={handleSave}
            >
              {selectedIndex === null ? "保存 ABI" : "更新 ABI"}
            </button>
            {selectedIndex !== null && (
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                onClick={handleSaveAsNew}
              >
                另存为新 ABI
              </button>
            )}
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
              onClick={resetSelection}
            >
              新建 ABI
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AbiManager;
