export function formatAsset(asset: string) {
  if (asset === "native" || asset === "XLM") return "XLM";
  const parts = asset.split(":");
  return parts[0] || asset;
}

export function formatAmount(amount: string, asset: string) {
  const num = Number.parseFloat(amount);
  if (Number.isNaN(num)) return `${amount} ${formatAsset(asset)}`;
  return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })} ${formatAsset(asset)}`;
}
