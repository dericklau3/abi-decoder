"use client";

import { useSearchParams } from "next/navigation";
import BatchBalanceChecker from "./BatchBalanceChecker";
import BatchContractCaller from "./BatchContractCaller";
import BatchTransfer from "./BatchTransfer";

const operations = [
  { id: "transfer", label: "批量转账", Panel: BatchTransfer },
  { id: "balance", label: "批量查余额", Panel: BatchBalanceChecker },
  { id: "call", label: "批量调用", Panel: BatchContractCaller },
];

export default function BatchOperations() {
  const searchParams = useSearchParams();
  const active = operations.find(({ id }) => id === searchParams.get("tool")) ?? operations[0];

  function selectOperation(id: string) {
    if (id === active.id) return;

    const url = new URL(window.location.href);
    url.searchParams.set("tool", id);
    window.history.pushState(null, "", url);
  }

  return (
    <>
      <div
        role="group"
        aria-label="批量操作"
        className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-6 pt-6 lg:pt-20"
      >
        {operations.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === active.id}
            aria-controls={`batch-panel-${id}`}
            className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
              id === active.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
            onClick={() => selectOperation(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {operations.map(({ id, Panel }) => (
        <div key={id} id={`batch-panel-${id}`} hidden={id !== active.id}>
          <Panel />
        </div>
      ))}
    </>
  );
}
