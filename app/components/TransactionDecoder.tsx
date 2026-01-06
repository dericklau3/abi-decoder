"use client";

import { useState, useEffect } from 'react';
import { Interface } from 'ethers';
import { decodeDeployData } from 'viem';

type SavedAbi = { name: string; abi: string };

const ABI_LIST_KEY = 'abiList';
const CURRENT_ABI_KEY = 'currentAbi';

const safeJsonParse = <T,>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeHex = (value: string) => {
  const trimmed = value.replace(/\s+/g, '');
  if (!trimmed) {
    return '0x';
  }
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
};

const processArgs = (args: unknown): unknown => {
  if (Array.isArray(args)) {
    return args.map(processArgs);
  }
  if (typeof args === 'bigint') {
    return args.toString();
  }
  if (args && typeof args === 'object') {
    const processed: Record<string, unknown> = {};
    for (const key in args) {
      processed[key] = processArgs((args as Record<string, unknown>)[key]);
    }
    return processed;
  }
  return args;
};

const TransactionDecoder = () => {
  // 保存的 ABI 列表，格式为 { name: string, abi: string }[]
  const [savedAbis, setSavedAbis] = useState<Array<SavedAbi>>([]);
  const [abi, setAbi] = useState('');
  const [abiName, setAbiName] = useState('');
  const [txData, setTxData] = useState('');
  const [functionName, setFunctionName] = useState('');
  const [decodedData, setDecodedData] = useState<any>(null);
  const [error, setError] = useState('');
  const [constructorData, setConstructorData] = useState('');
  const [bytecode, setBytecode] = useState('');
  const [decodedConstructor, setDecodedConstructor] = useState<any>(null);
  const [eventTopics, setEventTopics] = useState('');
  const [eventData, setEventData] = useState('');
  const [decodedEvent, setDecodedEvent] = useState<any>(null);
  const [activePanel, setActivePanel] = useState<'tx' | 'event' | 'constructor'>('tx');

  // 添加 useEffect 来处理客户端数据加载
  useEffect(() => {
    // 在客户端加载保存的数据
    const savedAbiList = safeJsonParse<Array<SavedAbi>>(localStorage.getItem(ABI_LIST_KEY) || '[]', []);
    const currentAbi = localStorage.getItem(CURRENT_ABI_KEY) || '';
    
    setSavedAbis(savedAbiList);
    setAbi(currentAbi);
  }, []);

  const persistAbiList = (abiList: Array<SavedAbi>, current?: string) => {
    setSavedAbis(abiList);
    localStorage.setItem(ABI_LIST_KEY, JSON.stringify(abiList));
    if (current !== undefined) {
      localStorage.setItem(CURRENT_ABI_KEY, current);
    }
  };

  const saveAbi = () => {
    if (!abiName.trim() || !abi.trim()) {
      setError('请输入 ABI 名称和内容');
      return;
    }

    const newAbiList = [...savedAbis, { name: abiName.trim(), abi }];
    persistAbiList(newAbiList, abi);
    setAbiName('');
  };

  const selectAbi = (savedAbi: SavedAbi) => {
    setAbi(savedAbi.abi);
    localStorage.setItem(CURRENT_ABI_KEY, savedAbi.abi);
  };

  const deleteAbi = (index: number) => {
    const newAbiList = savedAbis.filter((_, i) => i !== index);
    persistAbiList(newAbiList);
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const abiContent = json.abi ? JSON.stringify(json.abi, null, 2) : text;
        
        // 使用文件名（去掉扩展名）作为 ABI 名称
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        
        // 直接保存 ABI
        const newAbiList = [...savedAbis, { name: fileName, abi: abiContent }];
        persistAbiList(newAbiList, abiContent);
        setAbi(abiContent);
        
      } catch (err) {
        setError('文件解析失败：' + (err as Error).message);
      }
    }
  };

  const decodeTransaction = () => {
    try {
      setError('');
      const iface = new Interface(JSON.parse(abi));
      const decoded = iface.parseTransaction({ data: txData });
      
      if (!decoded) {
        setError('无法解析交易数据');
        return;
      }

      setDecodedData({
        name: decoded.name,
        signature: decoded.signature,
        args: processArgs(decoded.args),
      });
    } catch (err) {
      setError('解析失败：' + (err as Error).message);
    }
  };

  const decodeConstructor = () => {
    setError('');
    setDecodedConstructor(null);
    try {
      const abiJson = JSON.parse(abi);
      // viem 需要 ABI 为对象数组
      if (!Array.isArray(abiJson)) {
        setError('ABI 格式错误，需为数组');
        return;
      }
      if (!bytecode || !bytecode.startsWith('0x')) {
        setError('请正确填写合约 bytecode (0x...)');
        return;
      }
      // viem 的 decodeDeployData 要求 data、abi、bytecode
      const dataHex = normalizeHex(constructorData) as `0x${string}`;
      // 仅解码参数时，bytecode 可传空字符串
      const decoded = decodeDeployData({ abi: abiJson, data: dataHex, bytecode: bytecode as `0x${string}` });
      setDecodedConstructor(decoded.args);
    } catch (err) {
      setError('Constructor 解析失败：' + (err as Error).message);
    }
  };

  const decodeEvent = () => {
    try {
      setError('');
      setDecodedEvent(null);
      const iface = new Interface(JSON.parse(abi));
      const topics = eventTopics
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map(normalizeHex);
      if (topics.length === 0) {
        setError('请填写 event topics');
        return;
      }
      const dataHex = normalizeHex(eventData || '0x');
      const decoded = iface.parseLog({ topics, data: dataHex });
      if (!decoded) {
        setError('无法解析事件日志');
        return;
      }
      setDecodedEvent({
        name: decoded.name,
        signature: decoded.signature,
        args: processArgs(decoded.args),
      });
    } catch (err) {
      setError('事件解析失败：' + (err as Error).message);
    }
  };

  const clearInputs = () => {
    setAbi('');
    setFunctionName('');
    setTxData('');
    setDecodedData(null);
    setEventTopics('');
    setEventData('');
    setDecodedEvent(null);
    setError('');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          交易解析与 Constructor 解码
        </h1>
        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
          将 ABI、调用数据与部署参数集中管理，快速解析交易输入与 constructor
          参数。
        </p>
      </div>

      <div className="fade-up-delay grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* 左侧 ABI 列表 */}
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
                className="group flex items-center justify-between rounded-2xl border border-transparent bg-slate-50 px-3 py-2 transition hover:border-slate-200 hover:bg-white"
              >
                <button
                  className="text-left text-sm font-medium text-slate-700 transition hover:text-slate-900"
                  onClick={() => selectAbi(savedAbi)}
                >
                  {savedAbi.name}
                </button>
                <button
                  className="text-sm text-slate-400 transition hover:text-rose-500"
                  onClick={() => deleteAbi(index)}
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

        {/* 右侧主要内容 */}
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">共用 ABI</h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                Shared ABI
              </span>
            </div>
            <div className="mb-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">合约 ABI</label>
              <div
                className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 transition hover:border-slate-300"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <textarea
                  className="h-36 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={abi}
                  onChange={(e) => setAbi(e.target.value)}
                  placeholder="请输入合约 ABI (JSON 格式) 或拖拽 JSON 文件到此处"
                />
                <p className="mt-2 text-xs text-slate-400">
                  支持拖拽 ABI JSON 文件，自动解析并保存到左侧列表。
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">解析面板</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    activePanel === 'tx'
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                  onClick={() => setActivePanel('tx')}
                >
                  交易解析
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    activePanel === 'event'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                  onClick={() => setActivePanel('event')}
                >
                  事件解析
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    activePanel === 'constructor'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                  onClick={() => setActivePanel('constructor')}
                >
                  Constructor
                </button>
              </div>
            </div>

            {activePanel === 'tx' && (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">函数名称</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={functionName}
                      onChange={(e) => setFunctionName(e.target.value)}
                      placeholder="请输入要调用的函数名称（可选）"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">data</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={txData}
                      onChange={(e) => setTxData(e.target.value)}
                      placeholder="请输入交易数据 (0x...)"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                    onClick={decodeTransaction}
                  >
                    解析交易
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                    onClick={clearInputs}
                  >
                    清除输入
                  </button>
                </div>
              </div>
            )}

            {activePanel === 'event' && (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Topics</label>
                  <textarea
                    className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={eventTopics}
                    onChange={(e) => setEventTopics(e.target.value)}
                    placeholder="按行或逗号分隔输入 topics (0x...)"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Data</label>
                  <textarea
                    className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={eventData}
                    onChange={(e) => setEventData(e.target.value)}
                    placeholder="请输入 event data (0x...)"
                  />
                </div>
                <button
                  className="w-fit rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500"
                  onClick={decodeEvent}
                >
                  解析事件
                </button>
              </div>
            )}

            {activePanel === 'constructor' && (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Constructor 参数数据 (CreationCode + constructorArgs bytecode)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={constructorData}
                    onChange={(e) => setConstructorData(e.target.value)}
                    placeholder="请输入合约部署时的 constructor 参数 data (0x...)"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">合约 Creation Bytecode</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={bytecode}
                    onChange={(e) => setBytecode(e.target.value)}
                    placeholder="请输入合约 Bytecode (0x...)"
                  />
                </div>
                <button
                  className="w-fit rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500"
                  onClick={decodeConstructor}
                >
                  解析 Constructor
                </button>
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
              {error}
            </div>
          )}

          {activePanel === 'tx' && decodedData && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
              <h3 className="text-base font-semibold text-slate-900">交易解析结果</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>函数名称: {decodedData.name}</p>
                <p>函数签名: {decodedData.signature}</p>
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700">参数</p>
                <pre className="mt-2 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                  {JSON.stringify(decodedData.args, null, 2)}
                </pre>
              </div>
            </section>
          )}

          {activePanel === 'event' && decodedEvent && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
              <h3 className="text-base font-semibold text-slate-900">事件解析结果</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>事件名称: {decodedEvent.name}</p>
                <p>事件签名: {decodedEvent.signature}</p>
              </div>
              <pre className="mt-4 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                {JSON.stringify(decodedEvent.args, null, 2)}
              </pre>
            </section>
          )}

          {activePanel === 'constructor' && decodedConstructor && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
              <h3 className="text-base font-semibold text-slate-900">Constructor 解析结果</h3>
              <pre className="mt-4 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                {JSON.stringify(
                  decodedConstructor,
                  (key, value) => (typeof value === 'bigint' ? value.toString() : value),
                  2
                )}
              </pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionDecoder;
