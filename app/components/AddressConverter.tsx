"use client";

import { useState } from "react";
import { getAddress, toUtf8String } from "ethers";
import {
  bytes64AddressToHex,
  bytes64HexToAddress,
  bytes64HexToDecimal,
  bytes64HexToText,
  decimalToBytes64Hex,
  decodeBase64ToUtf8,
  encodeUtf8ToBase64,
  isValidDecimal,
  isValidHex,
  MAX_UINT256,
  normalizeAddressInput,
  normalizeHexInput,
  textToBytes64Hex,
} from "./address-converter-utils";

const AddressConverter = () => {
  const [addressInput, setAddressInput] = useState("");
  const [checksumAddress, setChecksumAddress] = useState("");
  const [solidityAddress, setSolidityAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [bytesInput, setBytesInput] = useState("");
  const [stringOutput, setStringOutput] = useState("");
  const [bytesError, setBytesError] = useState("");
  const [decimalInput, setDecimalInput] = useState("");
  const [bytes32HexOutput, setBytes32HexOutput] = useState("");
  const [decimalToHexError, setDecimalToHexError] = useState("");
  const [bytes32HexInput, setBytes32HexInput] = useState("");
  const [decimalOutput, setDecimalOutput] = useState("");
  const [hexToDecimalError, setHexToDecimalError] = useState("");
  const [base64StringInput, setBase64StringInput] = useState("");
  const [base64Output, setBase64Output] = useState("");
  const [base64EncodeError, setBase64EncodeError] = useState("");
  const [base64Input, setBase64Input] = useState("");
  const [base64DecodedOutput, setBase64DecodedOutput] = useState("");
  const [base64DecodeError, setBase64DecodeError] = useState("");
  const [bytes64DecimalInput, setBytes64DecimalInput] = useState("");
  const [bytes64DecimalOutput, setBytes64DecimalOutput] = useState("");
  const [bytes64FromDecimalError, setBytes64FromDecimalError] = useState("");
  const [bytes64DecimalHexInput, setBytes64DecimalHexInput] = useState("");
  const [bytes64DecodedDecimalOutput, setBytes64DecodedDecimalOutput] = useState("");
  const [bytes64ToDecimalError, setBytes64ToDecimalError] = useState("");
  const [bytes64TextInput, setBytes64TextInput] = useState("");
  const [bytes64TextOutput, setBytes64TextOutput] = useState("");
  const [bytes64FromTextError, setBytes64FromTextError] = useState("");
  const [bytes64TextHexInput, setBytes64TextHexInput] = useState("");
  const [bytes64DecodedTextOutput, setBytes64DecodedTextOutput] = useState("");
  const [bytes64ToTextError, setBytes64ToTextError] = useState("");
  const [bytes64AddressInput, setBytes64AddressInput] = useState("");
  const [bytes64AddressOutput, setBytes64AddressOutput] = useState("");
  const [bytes64FromAddressError, setBytes64FromAddressError] = useState("");
  const [bytes64AddressHexInput, setBytes64AddressHexInput] = useState("");
  const [bytes64DecodedAddressOutput, setBytes64DecodedAddressOutput] = useState("");
  const [bytes64ToAddressError, setBytes64ToAddressError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const convertAddress = (value: string) => {
    setAddressError("");
    setCopyMessage("");
    const normalized = normalizeAddressInput(value);
    if (!normalized) {
      setChecksumAddress("");
      setSolidityAddress("");
      return;
    }
    try {
      const checksummed = getAddress(normalized);
      setChecksumAddress(checksummed);
      setSolidityAddress(`address(${checksummed})`);
    } catch (err) {
      setAddressError("地址格式错误，请检查输入");
      setChecksumAddress("");
      setSolidityAddress("");
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

  const convertBytesToString = (value: string) => {
    setBytesError("");
    setCopyMessage("");
    const normalized = normalizeHexInput(value);
    if (!normalized) {
      setStringOutput("");
      return;
    }
    const hexBody = normalized.slice(2);
    if (!isValidHex(hexBody)) {
      setBytesError("请输入有效的 hex 字节串");
      setStringOutput("");
      return;
    }
    if (hexBody.length % 2 !== 0) {
      setBytesError("Hex 长度需为偶数");
      setStringOutput("");
      return;
    }
    try {
      setStringOutput(toUtf8String(normalized));
    } catch (err) {
      setBytesError("无法解析为 UTF-8 字符串");
      setStringOutput("");
    }
  };

  const convertDecimalToBytes32 = (value: string) => {
    setDecimalToHexError("");
    setCopyMessage("");
    const trimmed = value.trim();
    if (!trimmed) {
      setBytes32HexOutput("");
      return;
    }
    if (!isValidDecimal(trimmed)) {
      setDecimalToHexError("请输入有效的十进制非负整数");
      setBytes32HexOutput("");
      return;
    }
    try {
      const decimal = BigInt(trimmed);
      if (decimal > MAX_UINT256) {
        setDecimalToHexError("数值超出 uint256 / bytes32 可表示范围");
        setBytes32HexOutput("");
        return;
      }
      setBytes32HexOutput(`0x${decimal.toString(16).padStart(64, "0")}`);
    } catch {
      setDecimalToHexError("十进制转换失败");
      setBytes32HexOutput("");
    }
  };

  const convertBytes32ToDecimal = (value: string) => {
    setHexToDecimalError("");
    setCopyMessage("");
    const normalized = normalizeHexInput(value);
    if (!normalized) {
      setDecimalOutput("");
      return;
    }
    const hexBody = normalized.slice(2);
    if (!isValidHex(hexBody)) {
      setHexToDecimalError("请输入有效的十六进制");
      setDecimalOutput("");
      return;
    }
    if (hexBody.length > 64) {
      setHexToDecimalError("Hex 长度不能超过 bytes32（64 个 hex 字符）");
      setDecimalOutput("");
      return;
    }
    try {
      const paddedHex = hexBody.padStart(64, "0");
      setDecimalOutput(BigInt(`0x${paddedHex}`).toString(10));
    } catch {
      setHexToDecimalError("bytes32 转十进制失败");
      setDecimalOutput("");
    }
  };

  const convertStringToBase64 = (value: string) => {
    setBase64EncodeError("");
    setCopyMessage("");
    if (!value) {
      setBase64Output("");
      return;
    }

    try {
      setBase64Output(encodeUtf8ToBase64(value));
    } catch {
      setBase64EncodeError("Base64 编码失败");
      setBase64Output("");
    }
  };

  const convertBase64ToString = (value: string) => {
    setBase64DecodeError("");
    setCopyMessage("");
    if (!value.trim()) {
      setBase64DecodedOutput("");
      return;
    }

    try {
      setBase64DecodedOutput(decodeBase64ToUtf8(value));
    } catch (error) {
      setBase64DecodeError(
        error instanceof Error ? error.message : "Base64 解码失败",
      );
      setBase64DecodedOutput("");
    }
  };

  const convertNumberToBytes64 = (value: string) => {
    setBytes64FromDecimalError("");
    setCopyMessage("");
    const trimmed = value.trim();
    if (!trimmed) {
      setBytes64DecimalOutput("");
      return;
    }

    try {
      setBytes64DecimalOutput(decimalToBytes64Hex(trimmed));
    } catch (error) {
      setBytes64FromDecimalError(
        error instanceof Error ? error.message : "number 转 bytes64 失败",
      );
      setBytes64DecimalOutput("");
    }
  };

  const convertBytes64ToNumber = (value: string) => {
    setBytes64ToDecimalError("");
    setCopyMessage("");
    if (!value.trim()) {
      setBytes64DecodedDecimalOutput("");
      return;
    }

    try {
      setBytes64DecodedDecimalOutput(bytes64HexToDecimal(value));
    } catch (error) {
      setBytes64ToDecimalError(
        error instanceof Error ? error.message : "bytes64 转 number 失败",
      );
      setBytes64DecodedDecimalOutput("");
    }
  };

  const convertTextToBytes64 = (value: string) => {
    setBytes64FromTextError("");
    setCopyMessage("");
    if (!value) {
      setBytes64TextOutput("");
      return;
    }

    try {
      setBytes64TextOutput(textToBytes64Hex(value));
    } catch (error) {
      setBytes64FromTextError(
        error instanceof Error ? error.message : "text 转 bytes64 失败",
      );
      setBytes64TextOutput("");
    }
  };

  const convertBytes64ToText = (value: string) => {
    setBytes64ToTextError("");
    setCopyMessage("");
    if (!value.trim()) {
      setBytes64DecodedTextOutput("");
      return;
    }

    try {
      setBytes64DecodedTextOutput(bytes64HexToText(value));
    } catch (error) {
      setBytes64ToTextError(
        error instanceof Error ? error.message : "bytes64 转 text 失败",
      );
      setBytes64DecodedTextOutput("");
    }
  };

  const convertAddressToBytes64 = (value: string) => {
    setBytes64FromAddressError("");
    setCopyMessage("");
    const trimmed = value.trim();
    if (!trimmed) {
      setBytes64AddressOutput("");
      return;
    }

    try {
      setBytes64AddressOutput(bytes64AddressToHex(trimmed));
    } catch (error) {
      setBytes64FromAddressError(
        error instanceof Error ? error.message : "address 转 bytes64 失败",
      );
      setBytes64AddressOutput("");
    }
  };

  const convertBytes64ToAddress = (value: string) => {
    setBytes64ToAddressError("");
    setCopyMessage("");
    if (!value.trim()) {
      setBytes64DecodedAddressOutput("");
      return;
    }

    try {
      setBytes64DecodedAddressOutput(bytes64HexToAddress(value));
    } catch (error) {
      setBytes64ToAddressError(
        error instanceof Error ? error.message : "bytes64 转 address 失败",
      );
      setBytes64DecodedAddressOutput("");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          转换
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          集中处理地址、编码与数值格式转换，方便在 EVM 开发和调试时快速复制使用。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">地址转换</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            Solidity Friendly
          </span>
        </div>
        <div className="grid gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">EOA 地址</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={addressInput}
              onChange={(e) => {
                const nextValue = e.target.value;
                setAddressInput(nextValue);
                convertAddress(nextValue);
              }}
              placeholder="请输入 EOA 地址 (0x...)"
            />
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
                aria-label="复制 Checksum 地址"
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
                aria-label="复制 Solidity 地址"
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
        </div>
        {copyMessage && (
          <div className="mt-3 text-xs text-slate-500">{copyMessage}</div>
        )}
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Bytes 转 String</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            Hex to UTF-8
          </span>
        </div>
        <div className="grid gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              bytes (hex)
            </label>
            <textarea
              className="min-h-[96px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={bytesInput}
              onChange={(e) => {
                const nextValue = e.target.value;
                setBytesInput(nextValue);
                convertBytesToString(nextValue);
              }}
              placeholder="请输入 Solidity bytes (0x...)"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              string 输出
            </label>
            <div className="flex gap-2">
              <textarea
                readOnly
                className="min-h-[96px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                value={stringOutput}
                placeholder="解析后的 UTF-8 字符串"
              />
              <button
                className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                onClick={() => handleCopy(stringOutput, "String 输出")}
                aria-label="复制 String 输出"
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
        </div>
        {bytesError && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {bytesError}
          </div>
        )}
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            bytes64 与 number / text / address 互转
          </h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            128 Hex Chars
          </span>
        </div>

        <div className="grid gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  number 输入
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={bytes64DecimalInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBytes64DecimalInput(nextValue);
                    convertNumberToBytes64(nextValue);
                  }}
                  placeholder="请输入十进制非负整数"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  bytes64 输出
                </label>
                <div className="flex gap-2">
                  <textarea
                    readOnly
                    className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 break-all"
                    value={bytes64DecimalOutput}
                    placeholder="0x + 128 个 hex 字符"
                  />
                  <button
                    className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    onClick={() => handleCopy(bytes64DecimalOutput, "bytes64 输出")}
                    aria-label="复制 bytes64 输出"
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
              {bytes64FromDecimalError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bytes64FromDecimalError}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  bytes64 输入
                </label>
                <textarea
                  className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={bytes64DecimalHexInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBytes64DecimalHexInput(nextValue);
                    convertBytes64ToNumber(nextValue);
                  }}
                  placeholder="请输入 bytes64 (0x...)"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  number 输出
                </label>
                <div className="flex gap-2">
                  <textarea
                    readOnly
                    className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    value={bytes64DecodedDecimalOutput}
                    placeholder="解析后的十进制整数"
                  />
                  <button
                    className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    onClick={() =>
                      handleCopy(bytes64DecodedDecimalOutput, "number 输出")
                    }
                    aria-label="复制 number 输出"
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
              {bytes64ToDecimalError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bytes64ToDecimalError}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  text 输入
                </label>
                <textarea
                  className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={bytes64TextInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBytes64TextInput(nextValue);
                    convertTextToBytes64(nextValue);
                  }}
                  placeholder="请输入 UTF-8 文本"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  bytes64 输出
                </label>
                <div className="flex gap-2">
                  <textarea
                    readOnly
                    className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 break-all"
                    value={bytes64TextOutput}
                    placeholder="0x + 128 个 hex 字符"
                  />
                  <button
                    className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    onClick={() => handleCopy(bytes64TextOutput, "bytes64 输出")}
                    aria-label="复制 text 转 bytes64 输出"
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
              {bytes64FromTextError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bytes64FromTextError}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  bytes64 输入
                </label>
                <textarea
                  className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={bytes64TextHexInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBytes64TextHexInput(nextValue);
                    convertBytes64ToText(nextValue);
                  }}
                  placeholder="请输入 bytes64 (0x...)"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  text 输出
                </label>
                <div className="flex gap-2">
                  <textarea
                    readOnly
                    className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    value={bytes64DecodedTextOutput}
                    placeholder="解析后的 UTF-8 文本"
                  />
                  <button
                    className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    onClick={() =>
                      handleCopy(bytes64DecodedTextOutput, "text 输出")
                    }
                    aria-label="复制 text 输出"
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
              {bytes64ToTextError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bytes64ToTextError}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  address 输入
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={bytes64AddressInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBytes64AddressInput(nextValue);
                    convertAddressToBytes64(nextValue);
                  }}
                  placeholder="请输入地址 (0x...)"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  bytes64 输出
                </label>
                <div className="flex gap-2">
                  <textarea
                    readOnly
                    className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 break-all"
                    value={bytes64AddressOutput}
                    placeholder="0x + 128 个 hex 字符"
                  />
                  <button
                    className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    onClick={() => handleCopy(bytes64AddressOutput, "bytes64 输出")}
                    aria-label="复制 address 转 bytes64 输出"
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
              {bytes64FromAddressError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bytes64FromAddressError}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  bytes64 输入
                </label>
                <textarea
                  className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={bytes64AddressHexInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBytes64AddressHexInput(nextValue);
                    convertBytes64ToAddress(nextValue);
                  }}
                  placeholder="请输入 bytes64 (0x...)"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  address 输出
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    value={bytes64DecodedAddressOutput}
                    placeholder="解析后的 checksum 地址"
                  />
                  <button
                    className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    onClick={() =>
                      handleCopy(bytes64DecodedAddressOutput, "address 输出")
                    }
                    aria-label="复制 address 输出"
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
              {bytes64ToAddressError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bytes64ToAddressError}
                </div>
              )}
            </div>
          </div>
        </div>

        {copyMessage && (
          <div className="mt-3 text-xs text-slate-500">{copyMessage}</div>
        )}
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Base64 编码 / 解码</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            UTF-8 Text
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                原始字符串
              </label>
              <textarea
                className="min-h-[96px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={base64StringInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setBase64StringInput(nextValue);
                  convertStringToBase64(nextValue);
                }}
                placeholder="请输入待编码的 UTF-8 字符串"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Base64 输出
              </label>
              <div className="flex gap-2">
                <textarea
                  readOnly
                  className="min-h-[96px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 break-all"
                  value={base64Output}
                  placeholder="编码后的 Base64"
                />
                <button
                  className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(base64Output, "Base64 输出")}
                  aria-label="复制 Base64 输出"
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
            {base64EncodeError && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {base64EncodeError}
              </div>
            )}
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Base64 输入
              </label>
              <textarea
                className="min-h-[96px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={base64Input}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setBase64Input(nextValue);
                  convertBase64ToString(nextValue);
                }}
                placeholder="请输入待解码的 Base64"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                解码字符串
              </label>
              <div className="flex gap-2">
                <textarea
                  readOnly
                  className="min-h-[96px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  value={base64DecodedOutput}
                  placeholder="解码后的 UTF-8 字符串"
                />
                <button
                  className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(base64DecodedOutput, "解码字符串")}
                  aria-label="复制解码字符串"
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
            {base64DecodeError && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {base64DecodeError}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">十进制 / 16 进制互转</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            bytes32 Hex
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                十进制输入
              </label>
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={decimalInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setDecimalInput(nextValue);
                  convertDecimalToBytes32(nextValue);
                }}
                placeholder="请输入十进制非负整数"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                bytes32 Hex 输出
              </label>
              <div className="flex gap-2">
                <textarea
                  readOnly
                  className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 break-all"
                  value={bytes32HexOutput}
                  placeholder="0x + 64 个 hex 字符"
                />
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(bytes32HexOutput, "bytes32 Hex 输出")}
                  aria-label="复制 bytes32 Hex 输出"
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
            {decimalToHexError && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {decimalToHexError}
              </div>
            )}
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                bytes32 Hex 输入
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={bytes32HexInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setBytes32HexInput(nextValue);
                  convertBytes32ToDecimal(nextValue);
                }}
                placeholder="请输入 0x...（不足 64 位会按 bytes32 左侧补零）"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                十进制输出
              </label>
              <div className="flex gap-2">
                <textarea
                  readOnly
                  className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 break-all"
                  value={decimalOutput}
                  placeholder="解析后的十进制整数"
                />
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(decimalOutput, "十进制输出")}
                  aria-label="复制十进制输出"
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
            {hexToDecimalError && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {hexToDecimalError}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AddressConverter;
