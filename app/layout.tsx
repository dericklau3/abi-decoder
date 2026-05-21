import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import WalletRootProvider from "./components/wallet/WalletRootProvider";

export const metadata: Metadata = {
  title: "EVM Toolkit",
  description: "一个面向 EVM 的交易解析、地址计算、ABI 管理与合约交互工具箱。",
};

const walletErrorGuardScript = `
(() => {
  const walletRejectionPattern = /user rejected|user denied|request rejected|rejected the request|denied transaction|denied message|rejected by user|用户拒绝|拒绝请求|could not coalesce error/i;

  const getText = (value) => {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value.message === "string") {
      return value.message;
    }
    if (value && typeof value.shortMessage === "string") {
      return value.shortMessage;
    }
    return "";
  };

  const isWalletRejection = (error) => {
    const queue = [error];
    const seen = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seen.has(current)) {
        continue;
      }
      seen.add(current);

      const text = getText(current);
      if (walletRejectionPattern.test(text)) {
        return true;
      }

      if (typeof current === "object") {
        const code = current.code ?? current.errorCode;
        if (
          code === 4001 ||
          code === "4001" ||
          code === "ACTION_REJECTED" ||
          code === "USER_REJECTED" ||
          code === "USER_DISCONNECTED"
        ) {
          return true;
        }

        queue.push(current.error, current.info, current.data, current.cause, current.reason);
      }
    }

    return false;
  };

  const closeExpectedWalletToast = () => {
    document.querySelectorAll("nextjs-portal").forEach((portal) => {
      const root = portal.shadowRoot;
      if (!root || !walletRejectionPattern.test(root.textContent || "")) {
        return;
      }
      root.querySelector("[data-nextjs-toast-errors-hide-button]")?.click?.();
    });
  };

  const suppressExpectedWalletError = (event) => {
    const reason = "reason" in event ? event.reason : event.error ?? event.message;
    if (!isWalletRejection(reason)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    window.setTimeout(closeExpectedWalletToast, 0);
    window.setTimeout(closeExpectedWalletToast, 50);
  };

  window.addEventListener("unhandledrejection", suppressExpectedWalletError, { capture: true });
  window.addEventListener("error", suppressExpectedWalletError, { capture: true });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: walletErrorGuardScript }} />
      </head>
      <body className="antialiased">
        <WalletRootProvider>{children}</WalletRootProvider>
      </body>
    </html>
  );
}
