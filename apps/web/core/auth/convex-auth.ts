import { WALLET_AUTH_KEY_ID } from "./wallet-auth-constants.ts";

export function isPublicRoute(path: string) {
  return (
    path === "/" ||
    path.startsWith("/docs") ||
    path.startsWith("/verify") ||
    path.startsWith("/pay")
  );
}

export function isCurrentWalletAuthKeyId(keyId: string | undefined) {
  return keyId === WALLET_AUTH_KEY_ID;
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

export function shouldReuseWalletToken({
  forceRefreshToken,
  hasValidToken,
}: {
  forceRefreshToken: boolean;
  hasValidToken: boolean;
}) {
  return hasValidToken && !forceRefreshToken;
}
