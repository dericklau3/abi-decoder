const walletRejectionPattern =
  /user rejected|user denied|request rejected|rejected the request|denied transaction|denied message|rejected by user|用户拒绝|拒绝请求|could not coalesce error/i;

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

const isWalletRejection = (error: unknown) => {
  const queue = [error];
  const seen = new Set<unknown>();

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
      const record = current as Record<string, unknown>;
      const code = record.code ?? record.errorCode;
      if (
        code === 4001 ||
        code === "4001" ||
        code === "ACTION_REJECTED" ||
        code === "USER_REJECTED" ||
        code === "USER_DISCONNECTED"
      ) {
        return true;
      }

      queue.push(record.error, record.info, record.data, record.cause, record.reason);
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

    if (!isWalletRejection(reason)) {
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
