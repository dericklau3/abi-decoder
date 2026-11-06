import { Suspense } from "react";
import AppShell from "../components/AppShell";
import BatchOperations from "../components/BatchOperations";

export default function BatchPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <BatchOperations />
      </Suspense>
    </AppShell>
  );
}
