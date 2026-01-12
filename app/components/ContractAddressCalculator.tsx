"use client";

import { useState } from "react";
import { getAddress, getCreateAddress } from "ethers";

const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const parseNonceInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null as bigint | null, error: "" };
  }

  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    const body = trimmed.slice(2);
    if (!body) {
      return { value: null, error: "Nonce 不能为空" };
    }
    if (!/^[0-9a-fA-F]+$/.test(body)) {
      return { value: null, error: "Nonce 需为有效的 hex" };
    }
    return { value: BigInt(`0x${body}`), error: "" };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: "Nonce 需为非负整数" };
  }

  return { value: BigInt(trimmed), error: "" };
};

const ContractAddressCalculator = () => {
  const [addressInput, setAddressInput] = useState("");
  const [nonceInput, setNonceInput] = useState("");
  const [derivedAddress, setDerivedAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [nonceError, setNonceError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const updateDerivedAddress = (nextAddress: string, nextNonce: string) => {
    setAddressError("");
    setNonceError("");
    setCopyMessage("");

    const normalizedAddress = normalizeAddressInput(nextAddress);
    const parsedNonce = parseNonceInput(nextNonce);

    if (!normalizedAddress || !nextNonce.trim()) {
      setDerivedAddress("");
      return;
    }

    if (parsedNonce.error) {
      setDerivedAddress("");
      setNonceError(parsedNonce.error);
      return;
    }

    try {
      const checksummed = getAddress(normalizedAddress);
      const computed = getCreateAddress({
        from: checksummed,
        nonce: parsedNonce.value ?? 0n,
      });
      setDerivedAddress(computed);
    } catch {
      setDerivedAddress("");
      setAddressError("EOA 地址格式错误，请检查输入");
    }
  };

  const handleCopy = async () => {
    if (!derivedAddress) {
      setCopyMessage("合约地址为空，无法复制");
      return;
    }
    try {
      await navigator.clipboard.writeText(derivedAddress);
      setCopyMessage("合约地址已复制");
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          合约地址计算
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          输入 EOA 地址与 nonce，计算出该地址部署合约后的地址结果。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">CREATE 合约地址</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            RLP(from, nonce)
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              EOA 地址
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={addressInput}
              onChange={(e) => {
                const nextValue = e.target.value;
                setAddressInput(nextValue);
                updateDerivedAddress(nextValue, nonceInput);
              }}
              placeholder="请输入 EOA 地址 (0x...)"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Nonce
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={nonceInput}
              onChange={(e) => {
                const nextValue = e.target.value;
                setNonceInput(nextValue);
                updateDerivedAddress(addressInput, nextValue);
              }}
              placeholder="输入 nonce (十进制或 0x...)"
            />
          </div>
        </div>

        {(addressError || nonceError) && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {addressError || nonceError}
          </div>
        )}

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            合约地址
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              value={derivedAddress}
              placeholder="计算结果会显示在这里"
            />
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
              onClick={handleCopy}
              aria-label="复制合约地址"
              title="复制"
            >
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
            </button>
          </div>
        </div>

        {copyMessage && (
          <div className="mt-3 text-xs text-slate-500">{copyMessage}</div>
        )}
      </section>
    </div>
  );
};

export default ContractAddressCalculator;
