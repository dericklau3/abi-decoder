import AppShell from './components/AppShell';
import TransactionDecoder from './components/TransactionDecoder';

export default function Home() {
  return (
    <AppShell>
      <TransactionDecoder />
    </AppShell>
  );
}
