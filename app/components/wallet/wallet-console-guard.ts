import { isUserRejectedWalletRequest } from "../contract-interaction-utils";

const walletRejectionPattern =
  /user rejected|user denied|rejected by (?:the )?user|用户拒绝/i;

declare global {
  interface Window {
    evmToolkitConsoleGuardInstalled?: boolean;
    litIssuedWarnings?: Set<string>;
  }
}

const ignoredConsoleWarnings = [
  "Lit is in dev mode. Not recommended for production!",
  "WalletConnect Core is already initialized.",
];

const getText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.shortMessage === "string") {
      return record.shortMessage;
    }
  }
  return "";
};

const closeExpectedWalletToast = () => {
  document.querySelectorAll("nextjs-portal").forEach((portal) => {
    const root = portal.shadowRoot;
    if (!root || !walletRejectionPattern.test(root.textContent || "")) {
      return;
    }
    const closeButton = root.querySelector<HTMLButtonElement>(
      "[data-nextjs-toast-errors-hide-button]",
    );
    closeButton?.click();
  });
};

const installWalletRuntimeGuards = () => {
  if (typeof window === "undefined") {
    return;
  }
  if (window.evmToolkitConsoleGuardInstalled) {
    return;
  }
  window.evmToolkitConsoleGuardInstalled = true;

  window.litIssuedWarnings ??= new Set();
  window.litIssuedWarnings.add("dev-mode");

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const message = args.map(getText).join(" ");
    if (ignoredConsoleWarnings.some((warning) => message.includes(warning))) {
      return;
    }
    originalWarn(...args);
  };

  const suppressExpectedWalletError = (event: Event) => {
    const reason =
      event instanceof PromiseRejectionEvent
        ? event.reason
        : event instanceof ErrorEvent
          ? event.error ?? event.message
          : null;

    if (!isUserRejectedWalletRequest(reason)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    window.setTimeout(closeExpectedWalletToast, 0);
    window.setTimeout(closeExpectedWalletToast, 50);
  };

  window.addEventListener("unhandledrejection", suppressExpectedWalletError, {
    capture: true,
  });
  window.addEventListener("error", suppressExpectedWalletError, {
    capture: true,
  });
};

installWalletRuntimeGuards();

export {};
