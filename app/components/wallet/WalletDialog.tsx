"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChains, useConnect, useDisconnect, useSwitchChain } from "wagmi";

export function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const account = useAccount();
  const chains = useChains();
  const { connectors, connectAsync, isPending: connecting } = useConnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const [error, setError] = useState("");
  const busy = connecting || switching;

  useEffect(() => {
    if (open) {
      setError("");
      ref.current?.showModal();
    } else ref.current?.close();
  }, [open]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "钱包操作失败，请重试。");
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="wallet-dialog-title" className="w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-6 text-slate-800 shadow-2xl backdrop:bg-slate-900/30">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="wallet-dialog-title" className="text-lg font-semibold">{account.isConnected ? "钱包与网络" : "连接钱包"}</h2>
        <button type="button" onClick={onClose} aria-label="关闭钱包弹窗" className="rounded-lg px-3 py-1 hover:bg-slate-100">✕</button>
      </div>
      {account.isConnected ? <>
        <p className="break-all text-sm">{account.address}</p>
        <p className="mt-2 text-sm font-medium">{account.chain?.name ?? `Chain #${account.chainId}`}（#{account.chainId}）</p>
        <p className="my-4 text-sm text-slate-500">操作跟随钱包当前网络。可直接在钱包切换到其他 EVM 网络，或使用下方快捷入口。</p>
        <div className="flex gap-3">
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => run(() => navigator.clipboard.writeText(account.address!))}>复制地址</button>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => { disconnect(); onClose(); }}>断开连接</button>
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">快捷切换网络</h3>
        <div className="max-h-64 overflow-y-auto">
          {chains.map(chain => <button key={chain.id} disabled={busy || chain.id === account.chainId} type="button" onClick={() => run(() => switchChainAsync({ chainId: chain.id }))} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-100 disabled:opacity-50">{chain.name}{chain.id === account.chainId ? " · 当前网络" : ""}</button>)}
        </div>
      </> : <>
        <p className="mb-4 text-sm text-slate-500">连接后保留钱包当前网络，不要求切换到预设网络。</p>
        <div className="max-h-80 overflow-y-auto">
          {connectors.map(connector => <button key={connector.uid} disabled={busy} type="button" onClick={() => run(() => connectAsync({ connector }))} className="block w-full rounded-xl border border-slate-200 px-4 py-3 mb-2 text-left hover:bg-slate-50 disabled:opacity-50">{connector.name}</button>)}
        </div>
      </>}
      {busy && <p role="status" className="mt-3 text-sm">请在钱包中确认…</p>}
      {error && <p role="alert" className="mt-3 break-words text-sm text-rose-600">{error}</p>}
    </dialog>
  );
}
