"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./wallet/WalletProvider";
import { getWalletDiscoveryHint } from "./wallet/wallet-display-utils";

type NavItem = {
  name: string;
  href: string;
};

const navItems: NavItem[] = [
  { name: "交易解码", href: "/" },
  { name: "转换", href: "/address" },
  { name: "JSON 格式化", href: "/json-formatter" },
  { name: "合约地址", href: "/contract-address" },
  { name: "合约交互", href: "/contract-interaction" },
  { name: "ABI 管理", href: "/abi-manager" },
  { name: "Selector 映射", href: "/abi-selectors" },
];

const shortAddress = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
  const {
    account,
    isWalletModalOpen,
    walletError,
    isConnecting,
    sortedEip6963Providers,
    openWalletModal,
    closeWalletModal,
    connectWallet,
    disconnectWallet,
  } = useWallet();
  const walletDiscoveryHint = getWalletDiscoveryHint(sortedEip6963Providers.length);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.08),_transparent_55%),linear-gradient(180deg,_#f8fafc,_#eef2ff_40%,_#f8fafc_100%)]">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white/90 px-5 py-6 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)] backdrop-blur transition-transform lg:static lg:translate-x-0 ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                Navigation
              </p>
              <p className="text-base font-semibold text-slate-900">EVM Toolkit</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="关闭侧边栏"
            >
              ×
            </button>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white"
                  }`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {isSidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="关闭侧边栏遮罩"
          />
        )}

        <main className="relative flex-1">
          <div className="pointer-events-none absolute left-6 top-6 z-20 lg:hidden">
            <button
              type="button"
              className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="打开侧边栏"
            >
              ☰ 侧边栏
            </button>
          </div>

          <div className="pointer-events-none absolute right-6 top-6 z-20">
            <button
              type="button"
              className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300"
              onClick={openWalletModal}
            >
              {account ? `钱包 ${shortAddress(account)}` : "连接钱包"}
            </button>
          </div>

          <div className="pt-16 lg:pt-0">{children}</div>
        </main>
      </div>

      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-6 py-10 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.6)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">选择钱包</h3>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                onClick={closeWalletModal}
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            {account && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">当前已连接</span>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300"
                    onClick={disconnectWallet}
                  >
                    断开连接
                  </button>
                </div>
                <div className="mt-2 break-all text-xs font-medium text-slate-500">{account}</div>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {sortedEip6963Providers.length > 0 && (
                <div className="space-y-2">
                  <div className="px-1 text-xs font-semibold text-slate-500">已发现钱包</div>
                  {sortedEip6963Providers.map((item) => (
                    <button
                      key={item.info.uuid}
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                      onClick={() => connectWallet(item.provider)}
                      disabled={isConnecting}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-3">
                          {item.info.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              src={item.info.icon}
                              className="h-7 w-7 flex-none rounded-lg border border-slate-200 bg-white object-contain"
                            />
                          ) : (
                            <span className="h-7 w-7 flex-none rounded-lg border border-slate-200 bg-slate-50" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate">{item.info.name || item.info.rdns}</span>
                            <span className="block truncate text-xs font-medium text-slate-400">
                              {item.info.rdns}
                            </span>
                          </span>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
                          已安装
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {walletDiscoveryHint && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {walletDiscoveryHint}
                </div>
              )}

              {walletError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {walletError}
                </div>
              )}

              <button
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                onClick={closeWalletModal}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppShell;
