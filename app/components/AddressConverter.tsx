"use client";

import { useState } from "react";
import { getAddress } from "ethers";

const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const AddressConverter = () => {
  const [addressInput, setAddressInput] = useState("");
  const [checksumAddress, setChecksumAddress] = useState("");
  const [solidityAddress, setSolidityAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const convertAddress = () => {
    setAddressError("");
    setCopyMessage("");
    setChecksumAddress("");
    setSolidityAddress("");
    const normalized = normalizeAddressInput(addressInput);
    if (!normalized) {
      setAddressError("请输入 EOA 地址");
      return;
    }
    try {
      const checksummed = getAddress(normalized);
      setChecksumAddress(checksummed);
      setSolidityAddress(`address(${checksummed})`);
    } catch (err) {
      setAddressError("地址格式错误，请检查输入");
    }
  };

  const handleCopy = async (value: string, label: string) => {
    if (!value) {
      setCopyMessage(`${label} 为空，无法复制`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} 已复制`);
    } catch {
      setCopyMessage(`${label} 复制失败，请检查浏览器权限`);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          地址转换
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          输入 EOA 地址，转换为校验和格式，并生成可直接粘贴到 Solidity 的写法。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">地址转换</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            Solidity Friendly
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">EOA 地址</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="请输入 EOA 地址 (0x...)"
            />
          </div>
          <div className="flex items-end">
            <button
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              onClick={convertAddress}
            >
              转换地址
            </button>
          </div>
        </div>
        {addressError && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {addressError}
          </div>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Checksum 地址</label>
            <div className="flex gap-2">
              <input
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                value={checksumAddress}
                placeholder="转换后输出 0x..."
              />
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                onClick={() => handleCopy(checksumAddress, "Checksum 地址")}
              >
                复制
              </button>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Solidity 地址</label>
            <div className="flex gap-2">
              <input
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                value={solidityAddress}
                placeholder="address(0x...)"
              />
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                onClick={() => handleCopy(solidityAddress, "Solidity 地址")}
              >
                复制
              </button>
            </div>
          </div>
        </div>
        {copyMessage && (
          <div className="mt-3 text-xs text-slate-500">{copyMessage}</div>
        )}
      </section>
    </div>
  );
};

export default AddressConverter;
