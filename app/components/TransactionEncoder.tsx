"use client";

import { useEffect, useMemo, useState } from "react";

import {
  encodeManualTransactionData,
  parseManualFunctionSignature,
  type ManualEncodeParam,
} from "./transaction-encoder-utils";
import {
  isIntegerParamType,
  type IntegerUnit,
} from "./contract-interaction-utils";

type ParamRow = ManualEncodeParam & {
  id: number;
};

const integerUnits: IntegerUnit[] = ["wei", "gwei", "ether"];

const createParamRow = (id: number): ParamRow => ({
  id,
  type: "uint256",
  value: "",
  unit: "wei",
});

const createParamRowsFromTypes = (
  types: string[],
  previousParams: ParamRow[],
): ParamRow[] =>
  types.map((type, index) => ({
    id: index + 1,
    type,
    value:
      previousParams[index]?.type === type ? previousParams[index]?.value ?? "" : "",
    unit: previousParams[index]?.unit ?? "wei",
  }));

const getIsIntegerType = (type: string) => {
  try {
    return isIntegerParamType(type);
  } catch {
    return false;
  }
};

const TransactionEncoder = () => {
  const [functionSignature, setFunctionSignature] = useState("");
  const [selector, setSelector] = useState("");
  const [params, setParams] = useState<ParamRow[]>([createParamRow(1)]);
  const [nextParamId, setNextParamId] = useState(2);
  const [copyMessage, setCopyMessage] = useState("");

  const signatureState = useMemo(() => {
    try {
      return {
        info: parseManualFunctionSignature(functionSignature),
        error: "",
      };
    } catch (err) {
      return {
        info: { selector: "", params: [] },
        error: (err as Error).message,
      };
    }
  }, [functionSignature]);

  const signatureInfo = signatureState.info;
  const hasFunctionSignature = Boolean(functionSignature.trim());
  const displayedSelector = signatureInfo.selector || selector;
  const hasPendingParamValues = params.some(
    (param) => param.type.trim() && !param.value.trim(),
  );
  const encodingState = useMemo(() => {
    if (signatureState.error) {
      return { encoded: null, error: signatureState.error };
    }
    if (!displayedSelector.trim() && params.every((param) => !param.type.trim())) {
      return { encoded: null, error: "" };
    }
    if (hasPendingParamValues) {
      return { encoded: null, error: "" };
    }

    try {
      const activeParams = params
        .map((param) => ({
          type: param.type,
          value: param.value,
          unit: param.unit,
        }))
        .filter((param) => param.type.trim());
      return {
        encoded: encodeManualTransactionData({
          functionSignature,
          selector,
          params: activeParams,
        }),
        error: "",
      };
    } catch (err) {
      return { encoded: null, error: `编码失败：${(err as Error).message}` };
    }
  }, [
    displayedSelector,
    functionSignature,
    hasPendingParamValues,
    params,
    selector,
    signatureState.error,
  ]);

  const { encoded } = encodingState;

  useEffect(() => {
    if (!hasFunctionSignature || signatureState.error) {
      return;
    }

    setParams((current) =>
      createParamRowsFromTypes(
        signatureInfo.params.map((param) => param.type),
        current,
      ),
    );
    setNextParamId(signatureInfo.params.length + 1);
  }, [hasFunctionSignature, signatureInfo.params, signatureState.error]);

  const updateParam = (
    id: number,
    patch: Partial<Omit<ParamRow, "id">>,
  ) => {
    setParams((current) =>
      current.map((param) =>
        param.id === id ? { ...param, ...patch } : param,
      ),
    );
  };

  const addParam = () => {
    if (hasFunctionSignature) {
      return;
    }
    setParams((current) => [...current, createParamRow(nextParamId)]);
    setNextParamId((current) => current + 1);
  };

  const removeParam = (id: number) => {
    if (hasFunctionSignature) {
      return;
    }
    setParams((current) => current.filter((param) => param.id !== id));
  };

  const handleFunctionSignatureChange = (value: string) => {
    setFunctionSignature(value);
    setCopyMessage("");

    if (!value.trim()) {
      return;
    }

    try {
      const parsed = parseManualFunctionSignature(value);
      setParams((current) => {
        const nextParams = createParamRowsFromTypes(
          parsed.params.map((param) => param.type),
          current,
        );
        return nextParams.length > 0 ? nextParams : [];
      });
      setNextParamId(parsed.params.length + 1);
    } catch {
      setParams([]);
    }
  };

  const clearInputs = () => {
    setFunctionSignature("");
    setSelector("");
    setParams([createParamRow(1)]);
    setNextParamId(2);
    setCopyMessage("");
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} 已复制`);
    } catch {
      setCopyMessage("复制失败，请手动复制");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          交易编码
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          手动填写 ABI 参数类型和值，生成参数 payload 或完整交易 calldata。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              函数签名
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={functionSignature}
              onChange={(event) => handleFunctionSignatureChange(event.target.value)}
              onInput={(event) => handleFunctionSignatureChange(event.currentTarget.value)}
              placeholder="transfer(address,uint256)"
            />
            <p className="mt-2 text-xs text-slate-500">
              填写后自动推导 selector；留空时可手填 selector 或只输出参数 payload。
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              selector
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm read-only:bg-slate-50 focus:border-slate-400 focus:outline-none"
              value={displayedSelector}
              readOnly={Boolean(signatureInfo.selector)}
              onChange={(event) => setSelector(event.target.value)}
              onInput={(event) => setSelector(event.currentTarget.value)}
              placeholder="0xa9059cbb"
            />
            <p className="mt-2 text-xs text-slate-500">
              如果同时填写函数签名，会优先使用函数签名推导出的 selector。
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">参数</h2>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={addParam}
              disabled={hasFunctionSignature}
            >
              添加参数
            </button>
          </div>

          <div className="space-y-3">
            {params.map((param, index) => {
              const isInteger = getIsIntegerType(param.type);
              return (
                <div
                  key={param.id}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(160px,220px)_1fr_120px_auto]"
                >
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-500">
                      type #{index}
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={param.type}
                      disabled={hasFunctionSignature}
                      onChange={(event) =>
                        updateParam(param.id, { type: event.target.value })
                      }
                      onInput={(event) =>
                        updateParam(param.id, { type: event.currentTarget.value })
                      }
                      placeholder="uint256 / address / uint256[]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-500">
                      value
                    </label>
                    <textarea
                      className="h-10 min-h-10 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={param.value}
                      onChange={(event) =>
                        updateParam(param.id, { value: event.target.value })
                      }
                      onInput={(event) =>
                        updateParam(param.id, { value: event.currentTarget.value })
                      }
                      placeholder='数组/tuple 可填 JSON，例如 ["1","2"]'
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-500">
                      unit
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
                      value={param.unit ?? "wei"}
                      disabled={!isInteger}
                      onChange={(event) =>
                        updateParam(param.id, {
                          unit: event.target.value as IntegerUnit,
                        })
                      }
                    >
                      {integerUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      className="rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm font-medium text-rose-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => removeParam(param.id)}
                      disabled={hasFunctionSignature || params.length === 1}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
            onClick={clearInputs}
            type="button"
          >
            清除输入
          </button>
        </div>
      </section>

      {encodingState.error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {encodingState.error}
        </div>
      )}

      {copyMessage && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
          {copyMessage}
        </div>
      )}

      {encoded && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">编码结果</h2>
              <p className="mt-1 text-xs text-slate-500">
                完整 data = selector + 参数 payload；无 selector 时两者相同。
              </p>
            </div>
            {encoded.selector && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs text-slate-700">
                {encoded.selector}
              </span>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">完整 data</p>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  onClick={() => copyValue(encoded.data, "完整 data")}
                >
                  复制
                </button>
              </div>
              <pre className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700">
                {encoded.data}
              </pre>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">参数 payload</p>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  onClick={() => copyValue(encoded.payload, "参数 payload")}
                >
                  复制
                </button>
              </div>
              <pre className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700">
                {encoded.payload}
              </pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default TransactionEncoder;
