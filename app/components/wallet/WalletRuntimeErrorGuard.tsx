"use client";

import { useEffect } from "react";
import { isUserRejectedWalletRequest } from "../contract-interaction-utils";

const closeExpectedWalletToast = () => {
  document.querySelectorAll("nextjs-portal").forEach((portal) => {
    const root = portal.shadowRoot;
    if (
      !root ||
      !/user rejected|user denied|rejected by (?:the )?user|用户拒绝/i.test(
        root.textContent ?? "",
      )
    ) {
      return;
    }

    const closeButton = root.querySelector<HTMLButtonElement>(
      "[data-nextjs-toast-errors-hide-button]",
    );
    closeButton?.click();
  });
};

export default function WalletRuntimeErrorGuard() {
  useEffect(() => {
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

    return () => {
      window.removeEventListener("unhandledrejection", suppressExpectedWalletError, {
        capture: true,
      });
      window.removeEventListener("error", suppressExpectedWalletError, {
        capture: true,
      });
    };
  }, []);

  return null;
}
