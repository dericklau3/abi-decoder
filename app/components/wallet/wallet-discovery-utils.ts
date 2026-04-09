type WalletDiscoveryRequestArgs = {
  isWalletModalOpen: boolean;
  hasRequestedDiscovery: boolean;
};

export const shouldRequestWalletDiscovery = ({
  isWalletModalOpen,
  hasRequestedDiscovery,
}: WalletDiscoveryRequestArgs) => {
  return isWalletModalOpen && !hasRequestedDiscovery;
};
