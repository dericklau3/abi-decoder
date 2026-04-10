"use client";

import { useEffect, useState } from "react";

import JsonTreeNode from "./JsonTreeNode";
import {
  formatJsonInput,
  serializeJsonValueForCopy,
  type JsonValue,
} from "./json-formatter-utils";

const CopyIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </svg>
);

const JsonFormatter = () => {
  const [rawInput, setRawInput] = useState("");
  const [parsedValue, setParsedValue] = useState<JsonValue | null>(null);
  const [hasFormattedResult, setHasFormattedResult] = useState(false);
  const [prettyOutput, setPrettyOutput] = useState("");
  const [error, setError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  useEffect(() => {
    if (!copyFeedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyFeedback("");
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [copyFeedback]);

  const handleFormat = () => {
    try {
      const formatted = formatJsonInput(rawInput);
      setParsedValue(formatted.value);
      setHasFormattedResult(true);
      setPrettyOutput(formatted.pretty);
      setError("");
      setCopyFeedback("");
    } catch (formatError) {
      setParsedValue(null);
      setHasFormattedResult(false);
      setPrettyOutput("");
      setError((formatError as Error).message);
    }
  };

  const handleClear = () => {
    setRawInput("");
    setParsedValue(null);
    setHasFormattedResult(false);
    setPrettyOutput("");
    setError("");
    setCopyFeedback("");
  };

  const handleCopyValue = async (value: JsonValue) => {
    try {
      await navigator.clipboard.writeText(serializeJsonValueForCopy(value));
      setCopyFeedback("已复制");
    } catch {
      setCopyFeedback("复制失败");
    }
  };

  const handleCopyAll = async () => {
    if (!hasFormattedResult || !prettyOutput) {
      setCopyFeedback("暂无内容");
      return;
    }

    try {
      await navigator.clipboard.writeText(prettyOutput);
      setCopyFeedback("已复制全部");
    } catch {
      setCopyFeedback("复制失败");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          JSON 格式化
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          粘贴任意 JSON，快速校验格式、整理缩进，并在右侧按结构浏览与复制值。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">格式化面板</h2>
            <p className="mt-1 text-sm text-slate-500">
              左侧输入原始 JSON，右侧查看整理后的树形结果。
            </p>
          </div>
          {copyFeedback ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              {copyFeedback}
            </span>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="json-formatter-input"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                原始 JSON
              </label>
              <textarea
                id="json-formatter-input"
                className={`min-h-[460px] w-full resize-y rounded-2xl border bg-white px-4 py-3 font-mono text-sm text-slate-700 shadow-sm focus:outline-none ${
                  error
                    ? "border-rose-300 bg-rose-50/40 focus:border-rose-400"
                    : "border-slate-200 focus:border-slate-400"
                }`}
                value={rawInput}
                onChange={(event) => {
                  setRawInput(event.target.value);
                  if (hasFormattedResult || prettyOutput) {
                    setParsedValue(null);
                    setHasFormattedResult(false);
                    setPrettyOutput("");
                    setCopyFeedback("");
                  }
                  if (error) {
                    setError("");
                  }
                }}
                placeholder='例如：{"name":"alice","items":[1,2,3]}'
                spellCheck={false}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  支持对象、数组与基础类型；格式化后可按节点单独复制值。
                </p>
                {error ? (
                  <span className="text-xs font-medium text-rose-600">{error}</span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                onClick={handleFormat}
              >
                格式化
              </button>
              <button
                type="button"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                onClick={handleClear}
              >
                清空
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">结构化结果</h3>
                <p className="mt-1 text-xs text-slate-500">
                  鼠标移入值区域可复制当前节点内容。
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                onClick={handleCopyAll}
              >
                <CopyIcon />
                复制全部
              </button>
            </div>

            <div className="min-h-[460px] rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              {!hasFormattedResult ? (
                <div className="flex h-full min-h-[428px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/80 px-6 text-center text-sm text-slate-400">
                  还没有格式化结果，输入 JSON 后点击“格式化”开始查看。
                </div>
              ) : (
                <div className="max-h-[680px] overflow-auto rounded-2xl border border-slate-200 bg-white p-4">
                  <JsonTreeNode value={parsedValue} onCopy={handleCopyValue} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default JsonFormatter;
