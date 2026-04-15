"use client";

import { useState } from "react";
import {
  EASTERN_TIME_ZONE,
  SHANGHAI_TIME_ZONE,
  formatTimestampSecondsInZone,
  timeTextToTimestampSeconds,
} from "./time-utils";

const TimeConverter = () => {
  const [timestampInput, setTimestampInput] = useState("");
  const [beijingTime, setBeijingTime] = useState("");
  const [easternTime, setEasternTime] = useState("");
  const [timestampError, setTimestampError] = useState("");
  const [beijingError, setBeijingError] = useState("");
  const [easternError, setEasternError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const clearErrors = () => {
    setTimestampError("");
    setBeijingError("");
    setEasternError("");
  };

  const clearOutputs = () => {
    setTimestampInput("");
    setBeijingTime("");
    setEasternTime("");
  };

  const applyTimestamp = (value: string) => {
    clearErrors();
    setCopyMessage("");
    const trimmed = value.trim();
    if (!trimmed) {
      clearOutputs();
      return;
    }

    try {
      setTimestampInput(trimmed);
      setBeijingTime(formatTimestampSecondsInZone(trimmed, SHANGHAI_TIME_ZONE));
      setEasternTime(formatTimestampSecondsInZone(trimmed, EASTERN_TIME_ZONE));
    } catch (error) {
      setTimestampError(
        error instanceof Error ? error.message : "时间戳转换失败",
      );
      setBeijingTime("");
      setEasternTime("");
    }
  };

  const applyBeijingTime = (value: string) => {
    clearErrors();
    setCopyMessage("");
    setBeijingTime(value);
    if (!value.trim()) {
      clearOutputs();
      return;
    }

    try {
      const nextTimestamp = timeTextToTimestampSeconds(value, SHANGHAI_TIME_ZONE);
      setTimestampInput(nextTimestamp);
      setEasternTime(
        formatTimestampSecondsInZone(nextTimestamp, EASTERN_TIME_ZONE),
      );
    } catch (error) {
      setBeijingError(
        error instanceof Error ? error.message : "北京时间转换失败",
      );
      setTimestampInput("");
      setEasternTime("");
    }
  };

  const applyEasternTime = (value: string) => {
    clearErrors();
    setCopyMessage("");
    setEasternTime(value);
    if (!value.trim()) {
      clearOutputs();
      return;
    }

    try {
      const nextTimestamp = timeTextToTimestampSeconds(value, EASTERN_TIME_ZONE);
      setTimestampInput(nextTimestamp);
      setBeijingTime(
        formatTimestampSecondsInZone(nextTimestamp, SHANGHAI_TIME_ZONE),
      );
    } catch (error) {
      setEasternError(
        error instanceof Error ? error.message : "美东时间转换失败",
      );
      setTimestampInput("");
      setBeijingTime("");
    }
  };

  const fillCurrentTime = () => {
    applyTimestamp(Math.floor(Date.now() / 1000).toString());
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">Time</h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          在秒级时间戳、北京时间和美东时间之间快速换算，方便链上开发和排查时区问题。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">时间换算</h2>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            onClick={fillCurrentTime}
          >
            获取当前时间
          </button>
        </div>

        <div className="grid gap-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              当前时间戳（秒）
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                value={timestampInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setTimestampInput(nextValue);
                  applyTimestamp(nextValue);
                }}
                placeholder="请输入秒级时间戳"
              />
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                onClick={() => handleCopy(timestampInput, "时间戳")}
                aria-label="复制时间戳"
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

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                北京时间
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={beijingTime}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setBeijingTime(nextValue);
                    applyBeijingTime(nextValue);
                  }}
                  placeholder="YYYY-MM-DD HH:mm:ss"
                />
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(beijingTime, "北京时间")}
                  aria-label="复制北京时间"
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
              <label className="mb-2 block text-sm font-medium text-slate-700">
                美东时间
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={easternTime}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setEasternTime(nextValue);
                    applyEasternTime(nextValue);
                  }}
                  placeholder="YYYY-MM-DD HH:mm:ss"
                />
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                  onClick={() => handleCopy(easternTime, "美东时间")}
                  aria-label="复制美东时间"
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
        </div>

        {(timestampError || beijingError || easternError) && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {timestampError || beijingError || easternError}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          输入格式固定为 <span className="font-mono">YYYY-MM-DD HH:mm:ss</span>，
          时间戳单位默认秒。
        </div>

        {copyMessage && (
          <div className="mt-3 text-xs text-slate-500">{copyMessage}</div>
        )}
      </section>
    </div>
  );
};

export default TimeConverter;
