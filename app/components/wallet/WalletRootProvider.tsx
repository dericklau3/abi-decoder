"use client";

import { WalletProvider } from "./WalletProvider";

export default function WalletRootProvider({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
