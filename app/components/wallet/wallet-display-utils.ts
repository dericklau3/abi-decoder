export const getWalletDiscoveryHint = (discoveredCount: number) => {
  if (discoveredCount > 0) {
    return "";
  }

  return "未发现可用钱包，请先安装 Web3 钱包插件";
};
