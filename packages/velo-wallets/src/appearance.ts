import type { WalletAppearanceConfig, WalletPalette, WalletTheme } from "./config.js";

export const WALLET_FONT_STACKS = {
  system: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, Cambria, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
} as const;

export const WALLET_BUTTON_PADDING = {
  sm: ".45rem .7rem",
  md: ".65rem 1rem",
  lg: ".8rem 1.25rem",
} as const;

export const WALLET_BUTTON_RADII = {
  square: "0",
  rounded: ".625rem",
  pill: "999px",
} as const;

export const WALLET_MODAL_RADII = { sm: ".375rem", md: ".75rem", lg: "1rem" } as const;
export const WALLET_MODAL_SHADOWS = {
  none: "none",
  sm: "0 4px 12px rgba(0, 0, 0, .12)",
  md: "0 18px 48px rgba(0, 0, 0, .22)",
} as const;

export function isDarkWalletTheme(theme: WalletTheme, systemDark = false) {
  return theme === "dark" || (theme === "system" && systemDark);
}

export function walletPalette(appearance: WalletAppearanceConfig, systemDark = false) {
  return isDarkWalletTheme(appearance.theme, systemDark)
    ? appearance.palettes.dark
    : appearance.palettes.light;
}

export function walletKitTheme(appearance: WalletAppearanceConfig, systemDark = false) {
  const palette = walletPalette(appearance, systemDark);
  return {
    background: palette.background,
    "background-secondary": palette.surface,
    "foreground-strong": palette.text,
    foreground: palette.text,
    "foreground-secondary": palette.mutedText,
    primary: palette.accent,
    "primary-foreground": palette.accentText,
    transparent: "rgba(0, 0, 0, 0)",
    lighter: palette.surface,
    light: palette.surfaceMuted,
    "light-gray": palette.border,
    gray: palette.mutedText,
    danger: palette.danger,
    border: palette.border,
    shadow: WALLET_MODAL_SHADOWS[appearance.modal.shadow],
    "border-radius": WALLET_MODAL_RADII[appearance.modal.radius],
    "font-family": WALLET_FONT_STACKS[appearance.fontFamily],
  };
}

export function walletCssVariables(
  appearance: WalletAppearanceConfig,
  palette: WalletPalette,
): Record<string, string> {
  const solid = appearance.button.variant === "solid";
  const outline = appearance.button.variant === "outline";
  return {
    "--velo-wallet-background": palette.background,
    "--velo-wallet-surface": palette.surface,
    "--velo-wallet-surface-muted": palette.surfaceMuted,
    "--velo-wallet-text": palette.text,
    "--velo-wallet-muted-text": palette.mutedText,
    "--velo-wallet-accent": palette.accent,
    "--velo-wallet-accent-text": palette.accentText,
    "--velo-wallet-border": palette.border,
    "--velo-wallet-danger": palette.danger,
    "--velo-wallet-focus-ring": palette.focusRing,
    "--velo-wallet-font-family": WALLET_FONT_STACKS[appearance.fontFamily],
    "--velo-wallet-button-background": solid
      ? palette.accent
      : outline
        ? "transparent"
        : palette.surfaceMuted,
    "--velo-wallet-button-text": solid ? palette.accentText : palette.accent,
    "--velo-wallet-button-border": outline ? palette.accent : palette.border,
    "--velo-wallet-button-padding": WALLET_BUTTON_PADDING[appearance.button.size],
    "--velo-wallet-button-radius": WALLET_BUTTON_RADII[appearance.button.radius],
    "--velo-wallet-modal-radius": WALLET_MODAL_RADII[appearance.modal.radius],
    "--velo-wallet-shadow": WALLET_MODAL_SHADOWS[appearance.modal.shadow],
  };
}

export function serializeCssVariables(variables: Record<string, string>) {
  return Object.entries(variables)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}
