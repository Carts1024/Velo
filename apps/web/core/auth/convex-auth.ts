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
  pathname,
  hasValidToken,
}: {
  walletStatus: string;
  walletAddress: string | null;
  pathname: string;
  hasValidToken: boolean;
}) {
  return (
    walletStatus === "connected" &&
    Boolean(walletAddress) &&
    (hasValidToken || !isPublicRoute(pathname))
  );
}
