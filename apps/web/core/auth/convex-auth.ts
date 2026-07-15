export function isPublicRoute(path: string) {
  return (
    path === "/" ||
    path.startsWith("/docs") ||
    path.startsWith("/verify") ||
    path.startsWith("/pay")
  );
}

export function shouldReportWalletAuthenticated({
  walletStatus,
  walletAddress,
  hasValidToken,
}: {
  walletStatus: string;
  walletAddress: string | null;
  hasValidToken: boolean;
}) {
  return walletStatus === "connected" && Boolean(walletAddress) && hasValidToken;
}
