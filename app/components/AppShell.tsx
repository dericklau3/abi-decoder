"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  name: string;
  href: string;
};

const navItems: NavItem[] = [
  { name: "交易解码", href: "/" },
  { name: "转换", href: "/address" },
  { name: "合约地址", href: "/contract-address" },
  { name: "合约交互", href: "/contract-interaction" },
  { name: "ABI 管理", href: "/abi-manager" },
];

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

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
          <div className="pt-16 lg:pt-0">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AppShell;
