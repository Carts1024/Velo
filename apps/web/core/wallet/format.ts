export function shortenAddress(address: string | null | undefined) {
  if (!address) {
    return "Not connected";
  }

  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}
