import type { Metadata } from "next";
import "./globals.css";
import WalletRootProvider from "./components/wallet/WalletRootProvider";

export const metadata: Metadata = {
  title: "EVM Toolkit",
  description: "一个面向 EVM 的交易解析、地址计算、ABI 管理与合约交互工具箱。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <WalletRootProvider>{children}</WalletRootProvider>
      </body>
    </html>
  );
}
