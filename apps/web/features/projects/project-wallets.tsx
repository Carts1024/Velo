"use client";

import { env } from "@/core/config/env";
import { useWallet } from "@/core/wallet/wallet-provider";
import {
  draftFromDocument,
  parseOriginLines,
  walletIntegrationSnippets,
} from "@/features/projects/wallet-config-form";
import {
  DEFAULT_WALLET_APPEARANCE_STYLE,
  DEFAULT_WALLET_CONFIG,
  normalizeWalletAppearance,
  validateWalletDraft,
  WALLET_CATALOG,
  type WalletAppearanceStyle,
  type WalletDraftConfig,
  type WalletPalette,
} from "@carts1024/velo-wallets/config";
import { api } from "@repo/backend/convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/ui/native-select";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Switch } from "@repo/ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

type SaveState =
  | "draft"
  | "unsaved"
  | "saving"
  | "publishing"
  | "published"
  | "disabled"
  | "failed";

const PALETTE_FIELDS: Array<[keyof WalletPalette, string]> = [
  ["background", "Background"],
  ["surface", "Surface"],
  ["surfaceMuted", "Muted surface"],
  ["text", "Text"],
  ["mutedText", "Muted text"],
  ["accent", "Accent"],
  ["accentText", "Accent text"],
  ["border", "Border"],
  ["danger", "Danger"],
  ["focusRing", "Focus ring"],
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Wallet configuration could not be updated";
}

export function ProjectWallets({ projectId }: { projectId: string }) {
  const wallet = useWallet();
  const typedProjectId = projectId as Id<"projects">;
  const stored = useQuery(
    api.wallet_configs.query.getDraft,
    wallet.address ? { projectId: typedProjectId } : "skip",
  );
  const saveDraft = useMutation(api.wallet_configs.mutation.saveDraft);
  const publish = useMutation(api.wallet_configs.mutation.publish);
  const setEnabled = useMutation(api.wallet_configs.mutation.setEnabled);
  const [draft, setDraft] = useState<WalletDraftConfig>({ ...DEFAULT_WALLET_CONFIG });
  const [saveState, setSaveState] = useState<SaveState>("draft");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [paletteTab, setPaletteTab] = useState<"light" | "dark">("light");
  const [previewState, setPreviewState] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

  useEffect(() => {
    if (stored) {
      setDraft(draftFromDocument(stored));
      setSaveState(
        stored.enabled ? "published" : stored.activePublicationId ? "disabled" : "draft",
      );
    }
  }, [stored]);

  const errors = useMemo(() => validateWalletDraft(draft), [draft]);
  const appearance = useMemo(() => normalizeWalletAppearance(draft), [draft]);
  const appBaseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const cdnBaseUrl = env.NEXT_PUBLIC_WALLETS_CDN_BASE_URL ?? `${appBaseUrl}/wallets`;
  const snippets = stored
    ? walletIntegrationSnippets({
        projectKey: stored.publicKey,
        cdnBaseUrl,
        apiBaseUrl: appBaseUrl,
      })
    : null;

  function updateDraft(update: Partial<WalletDraftConfig>) {
    setDraft((current) => ({ ...current, ...update }));
    setSaveState("unsaved");
    setFeedback(null);
  }

  function updateAppearance(update: Partial<WalletAppearanceStyle>) {
    updateDraft({
      appearance: {
        palettes: update.palettes ?? appearance.palettes,
        fontFamily: update.fontFamily ?? appearance.fontFamily,
        button: { ...appearance.button, ...update.button },
        modal: { ...appearance.modal, ...update.modal },
      },
    });
  }

  function updatePalette(mode: "light" | "dark", token: keyof WalletPalette, value: string) {
    updateAppearance({
      palettes: {
        ...appearance.palettes,
        [mode]: { ...appearance.palettes[mode], [token]: value },
      },
    });
  }

  async function handleSave() {
    if (errors.length) return;
    setSaveState("saving");
    try {
      await saveDraft({ projectId: typedProjectId, ...draft });
      setSaveState("draft");
      setFeedback("Draft saved. Publish when you are ready to update consuming applications.");
    } catch (error) {
      setSaveState("failed");
      setFeedback(errorMessage(error));
    }
  }

  async function handlePublish() {
    if (errors.length || saveState === "unsaved") return;
    const summary = `${draft.network === "public" ? "Mainnet" : "Testnet"}, ${draft.walletIds.length} wallets, ${draft.allowedOrigins.length} origins`;
    if (!window.confirm(`Publish a new immutable wallet revision?\n\n${summary}`)) return;
    if (
      draft.network === "public" &&
      window.prompt('Type "MAINNET" to publish this integration.') !== "MAINNET"
    )
      return;
    setSaveState("publishing");
    try {
      const result = await publish({ projectId: typedProjectId });
      setSaveState("published");
      setFeedback(
        `Revision ${result.revision} is live. Consuming apps will receive it on their next load.`,
      );
    } catch (error) {
      setSaveState("failed");
      setFeedback(errorMessage(error));
    }
  }

  async function toggleEnabled() {
    if (!stored?.activePublicationId) return;
    try {
      await setEnabled({ projectId: typedProjectId, enabled: !stored.enabled });
      setSaveState(stored.enabled ? "disabled" : "published");
      setFeedback(stored.enabled ? "Integration disabled." : "Published integration enabled.");
    } catch (error) {
      setSaveState("failed");
      setFeedback(errorMessage(error));
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  }

  if (!wallet.address) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold">Velo Wallets</h1>
        <Alert>
          <WalletIcon />
          <AlertTitle>Connect the owner wallet</AlertTitle>
          <AlertDescription>
            Only the project owner can configure and publish this integration.
          </AlertDescription>
        </Alert>
        <Button onClick={wallet.connect} className="w-fit">
          <WalletIcon />
          Connect wallet
        </Button>
      </section>
    );
  }
  if (stored === undefined)
    return (
      <section className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </section>
    );

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-5">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold">Velo Wallets</h1>
            <Badge variant="secondary">Alpha</Badge>
            <Badge variant="outline">{saveState}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Configure Stellar Wallets Kit once, publish it, and integrate multi-wallet connection
            with a component or React provider.
          </p>
        </header>

        <div aria-live="polite">
          {feedback ? (
            <Alert variant={saveState === "failed" ? "destructive" : "default"}>
              {saveState === "failed" ? <AlertCircleIcon /> : <CheckCircle2Icon />}
              <AlertTitle>
                {saveState === "failed" ? "Update failed" : "Configuration updated"}
              </AlertTitle>
              <AlertDescription>{feedback}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="rounded-lg border bg-white p-5">
          <div className="mb-5">
            <h2 className="font-semibold">Guided Testnet preset</h2>
            <p className="text-sm text-zinc-600">
              Starts with Freighter, localhost, session restore, and a system-aware theme.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => updateDraft({ ...DEFAULT_WALLET_CONFIG })}
          >
            Reset to safe preset
          </Button>
        </div>

        <div className="rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Wallet selection</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Transaction signing is included. Auth-entry and message signing depend on each wallet.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WALLET_CATALOG.map((item) => (
              <label
                key={item.id}
                htmlFor={`wallet-${item.id}`}
                className="flex cursor-pointer gap-3 rounded-md border p-3"
              >
                <Checkbox
                  id={`wallet-${item.id}`}
                  checked={draft.walletIds.includes(item.id)}
                  onCheckedChange={(checked) =>
                    updateDraft({
                      walletIds: checked
                        ? [...draft.walletIds, item.id]
                        : draft.walletIds.filter((id) => id !== item.id),
                    })
                  }
                  aria-label={`Enable ${item.name}`}
                />
                <span>
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-zinc-500">
                    Transaction · wallet-dependent advanced signing
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            WalletConnect, Ledger, and Trezor are deferred from v1 so the hosted runtime stays
            credential-free and predictable.
          </p>
        </div>

        <div className="rounded-lg border bg-white p-5">
          <Label htmlFor="wallet-network">Network</Label>
          <NativeSelect
            id="wallet-network"
            value={draft.network}
            onChange={(event) =>
              updateDraft({ network: event.target.value as WalletDraftConfig["network"] })
            }
            wrapperClassName="mt-2"
          >
            <NativeSelectOption value="testnet">Testnet</NativeSelectOption>
            <NativeSelectOption value="public">Mainnet</NativeSelectOption>
          </NativeSelect>
          {draft.network === "public" ? (
            <p className="mt-2 text-xs text-amber-700">
              Mainnet requires a non-local HTTPS origin and typed confirmation.
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border bg-white p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Appearance</h2>
              <p className="text-sm text-zinc-600">
                These brand controls style the embedded wallet controls and wallet selector.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateDraft({
                  theme: DEFAULT_WALLET_CONFIG.theme,
                  buttonLabel: DEFAULT_WALLET_CONFIG.buttonLabel,
                  appearance: DEFAULT_WALLET_APPEARANCE_STYLE,
                })
              }
            >
              Reset appearance
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="wallet-theme">Theme</Label>
              <NativeSelect
                id="wallet-theme"
                value={draft.theme}
                onChange={(event) =>
                  updateDraft({ theme: event.target.value as WalletDraftConfig["theme"] })
                }
                wrapperClassName="mt-2"
              >
                <NativeSelectOption value="system">System</NativeSelectOption>
                <NativeSelectOption value="light">Light</NativeSelectOption>
                <NativeSelectOption value="dark">Dark</NativeSelectOption>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="wallet-label" className="mt-4">
                Button label
              </Label>
              <Input
                id="wallet-label"
                maxLength={40}
                value={draft.buttonLabel}
                onChange={(event) => updateDraft({ buttonLabel: event.target.value })}
                className="mt-2"
              />
            </div>
            <AppearanceSelect
              id="wallet-font"
              label="Font"
              value={appearance.fontFamily}
              options={[
                ["system", "System sans"],
                ["serif", "Serif"],
                ["mono", "Monospace"],
              ]}
              onChange={(value) =>
                updateAppearance({ fontFamily: value as WalletAppearanceStyle["fontFamily"] })
              }
            />
            <AppearanceSelect
              id="wallet-button-variant"
              label="Button style"
              value={appearance.button.variant}
              options={[
                ["solid", "Solid"],
                ["outline", "Outline"],
                ["soft", "Soft"],
              ]}
              onChange={(value) =>
                updateAppearance({
                  button: {
                    ...appearance.button,
                    variant: value as WalletAppearanceStyle["button"]["variant"],
                  },
                })
              }
            />
            <AppearanceSelect
              id="wallet-button-size"
              label="Button size"
              value={appearance.button.size}
              options={[
                ["sm", "Small"],
                ["md", "Medium"],
                ["lg", "Large"],
              ]}
              onChange={(value) =>
                updateAppearance({
                  button: {
                    ...appearance.button,
                    size: value as WalletAppearanceStyle["button"]["size"],
                  },
                })
              }
            />
            <AppearanceSelect
              id="wallet-button-radius"
              label="Button radius"
              value={appearance.button.radius}
              options={[
                ["square", "Square"],
                ["rounded", "Rounded"],
                ["pill", "Pill"],
              ]}
              onChange={(value) =>
                updateAppearance({
                  button: {
                    ...appearance.button,
                    radius: value as WalletAppearanceStyle["button"]["radius"],
                  },
                })
              }
            />
            <AppearanceSelect
              id="wallet-modal-radius"
              label="Modal radius"
              value={appearance.modal.radius}
              options={[
                ["sm", "Small"],
                ["md", "Medium"],
                ["lg", "Large"],
              ]}
              onChange={(value) =>
                updateAppearance({
                  modal: {
                    ...appearance.modal,
                    radius: value as WalletAppearanceStyle["modal"]["radius"],
                  },
                })
              }
            />
            <AppearanceSelect
              id="wallet-modal-shadow"
              label="Modal shadow"
              value={appearance.modal.shadow}
              options={[
                ["none", "None"],
                ["sm", "Small"],
                ["md", "Medium"],
              ]}
              onChange={(value) =>
                updateAppearance({
                  modal: {
                    ...appearance.modal,
                    shadow: value as WalletAppearanceStyle["modal"]["shadow"],
                  },
                })
              }
            />
          </div>

          <div className="mt-6">
            <div className="mb-4 flex gap-2" aria-label="Palette editor">
              {(["light", "dark"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={paletteTab === mode ? "default" : "outline"}
                  aria-pressed={paletteTab === mode}
                  onClick={() => setPaletteTab(mode)}
                >
                  {mode === "light" ? "Light palette" : "Dark palette"}
                </Button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PALETTE_FIELDS.map(([token, label]) => (
                <ColorControl
                  key={`${paletteTab}-${token}`}
                  id={`wallet-${paletteTab}-${token}`}
                  label={label}
                  value={appearance.palettes[paletteTab][token]}
                  onChange={(value) => updatePalette(paletteTab, token, value)}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Colors use #RRGGBB. Velo blocks publication when text, focus, or control contrast is
              inaccessible.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Modal and session behavior</h2>
          <div className="mt-4 grid gap-4">
            <SettingSwitch
              label="Show install guidance"
              checked={draft.showInstallLabel}
              onCheckedChange={(checked) => updateDraft({ showInstallLabel: checked })}
            />
            <SettingSwitch
              label="Hide unavailable wallets"
              checked={draft.hideUnsupportedWallets}
              onCheckedChange={(checked) => updateDraft({ hideUnsupportedWallets: checked })}
            />
            <SettingSwitch
              label="Restore the last session"
              checked={draft.persistSession}
              onCheckedChange={(checked) => updateDraft({ persistSession: checked })}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5">
          <Label htmlFor="wallet-origins">Allowed origins</Label>
          <p className="mb-2 text-xs text-zinc-500">
            One exact HTTP(S) origin per line. Paths and wildcards are rejected; maximum 20.
          </p>
          <Textarea
            id="wallet-origins"
            rows={5}
            value={draft.allowedOrigins.join("\n")}
            onChange={(event) =>
              updateDraft({ allowedOrigins: parseOriginLines(event.target.value) })
            }
          />
        </div>

        {errors.length ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Fix before saving</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            disabled={errors.length > 0 || saveState === "saving" || saveState === "publishing"}
          >
            {saveState === "saving" ? "Saving…" : "Save draft"}
          </Button>
          <Button
            variant="secondary"
            onClick={handlePublish}
            disabled={
              !stored ||
              errors.length > 0 ||
              saveState === "unsaved" ||
              saveState === "saving" ||
              saveState === "publishing"
            }
          >
            {saveState === "publishing" ? "Publishing…" : "Publish revision"}
          </Button>
          {stored?.activePublicationId ? (
            <Button variant="outline" onClick={toggleEnabled}>
              {stored.enabled ? "Disable integration" : "Enable integration"}
            </Button>
          ) : null}
        </div>

        {snippets && stored?.activePublicationId ? (
          <div className="rounded-lg border bg-white p-5">
            <div className="mb-4">
              <h2 className="font-semibold">Integration instructions</h2>
              <p className="text-sm text-zinc-600">
                Allow your app origin, paste one option at the exact UI mounting location, then
                verify connection and signing.
              </p>
            </div>
            <Tabs defaultValue="html">
              <TabsList>
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="react">React / Next.js</TabsTrigger>
              </TabsList>
              <SnippetTab
                value="html"
                code={snippets.html}
                onCopy={() => copy(snippets.html, "HTML")}
              />
              <SnippetTab
                value="react"
                code={snippets.react}
                onCopy={() => copy(snippets.react, "React")}
              />
            </Tabs>
            <p className="mt-4 text-xs text-zinc-500">
              CSP: <code>{snippets.csp}</code>
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Listen for <code>velo:wallet-connected</code> in HTML, or call{" "}
              <code>useVeloWallet()</code> in a client component. Signing inputs and signatures
              never pass through Velo.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link href={`/wallet-preview/${stored.publicKey}`} target="_blank">
                  Open diagnostics <ExternalLinkIcon />
                </Link>
              </Button>
              <span aria-live="polite" className="text-xs text-emerald-700">
                {copied ? `${copied} copied` : ""}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="grid content-start gap-5 xl:sticky xl:top-6">
        <div className="rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Live wallet preview</h2>
          <div className="mt-3 flex flex-wrap gap-1" aria-label="Preview state">
            {(["disconnected", "connecting", "connected", "error"] as const).map((state) => (
              <Button
                key={state}
                type="button"
                size="sm"
                variant={previewState === state ? "secondary" : "ghost"}
                onClick={() => setPreviewState(state)}
              >
                {state}
              </Button>
            ))}
          </div>
          <WalletAppearancePreview
            appearance={appearance}
            mode={draft.theme === "dark" ? "dark" : paletteTab}
            state={previewState}
            walletCount={draft.walletIds.length}
            network={draft.network}
          />
        </div>
        <div className="rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Publication</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-zinc-500">Public project key</dt>
              <dd className="mt-1 break-all font-mono text-xs">
                {stored?.publicKey ?? "Created on first save"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Draft revision</dt>
              <dd>{stored?.draftRevision ?? 0}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Published revision</dt>
              <dd>{stored?.publishedRevision ?? "Not published"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Status</dt>
              <dd>
                {stored?.enabled ? "Live" : stored?.activePublicationId ? "Disabled" : "Draft only"}
              </dd>
            </div>
          </dl>
          {stored?.publicKey ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => copy(stored.publicKey, "Project key")}
            >
              <CopyIcon />
              Copy key
            </Button>
          ) : null}
        </div>
      </aside>
    </section>
  );
}

function SettingSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function SnippetTab({ value, code, onCopy }: { value: string; code: string; onCopy: () => void }) {
  return (
    <TabsContent value={value}>
      <div className="relative">
        <pre className="overflow-x-auto rounded-md bg-zinc-950 p-4 pr-12 text-xs text-zinc-100">
          <code>{code}</code>
        </pre>
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          className="absolute right-2 top-2"
          onClick={onCopy}
          aria-label={`Copy ${value} snippet`}
        >
          <CopyIcon />
        </Button>
      </div>
    </TabsContent>
  );
}

function AppearanceSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        wrapperClassName="mt-2"
      >
        {options.map(([optionValue, optionLabel]) => (
          <NativeSelectOption key={optionValue} value={optionValue}>
            {optionLabel}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function ColorControl({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const colorValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000";
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2 flex gap-2">
        <input
          aria-label={`${label} color picker`}
          type="color"
          value={colorValue}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-9 w-11 cursor-pointer rounded-md border bg-white p-1"
        />
        <Input
          id={id}
          value={value}
          maxLength={7}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="font-mono text-xs"
          aria-invalid={!/^#[0-9A-Fa-f]{6}$/.test(value)}
        />
      </div>
    </div>
  );
}

function WalletAppearancePreview({
  appearance,
  mode,
  state,
  walletCount,
  network,
}: {
  appearance: ReturnType<typeof normalizeWalletAppearance>;
  mode: "light" | "dark";
  state: "disconnected" | "connecting" | "connected" | "error";
  walletCount: number;
  network: WalletDraftConfig["network"];
}) {
  const palette = appearance.palettes[mode];
  const fontFamilies = {
    system: "ui-sans-serif, system-ui, sans-serif",
    serif: "ui-serif, Georgia, serif",
    mono: "ui-monospace, SFMono-Regular, monospace",
  } as const;
  const buttonRadii = { square: 0, rounded: 10, pill: 999 } as const;
  const modalRadii = { sm: 6, md: 12, lg: 16 } as const;
  const shadows = {
    none: "none",
    sm: "0 4px 12px rgba(0,0,0,.12)",
    md: "0 18px 48px rgba(0,0,0,.22)",
  } as const;
  const padding = { sm: "7px 11px", md: "10px 16px", lg: "13px 20px" } as const;
  const primaryStyle: CSSProperties = {
    background:
      appearance.button.variant === "solid"
        ? palette.accent
        : appearance.button.variant === "outline"
          ? "transparent"
          : palette.surfaceMuted,
    border: `1px solid ${appearance.button.variant === "outline" ? palette.accent : palette.border}`,
    borderRadius: buttonRadii[appearance.button.radius],
    color: appearance.button.variant === "solid" ? palette.accentText : palette.accent,
    fontFamily: fontFamilies[appearance.fontFamily],
    fontSize: appearance.button.size === "sm" ? 13 : appearance.button.size === "lg" ? 16 : 14,
    fontWeight: 600,
    padding: padding[appearance.button.size],
  };
  const secondaryStyle: CSSProperties = {
    ...primaryStyle,
    background: palette.surface,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 12,
    padding: "7px 10px",
  };
  const label =
    state === "connecting"
      ? "Connecting…"
      : state === "connected"
        ? "Freighter · GD7O2C2…3I2SP"
        : appearance.buttonLabel || "Connect wallet";

  return (
    <div
      className="mt-4 overflow-hidden border p-4"
      style={{
        background: palette.background,
        borderColor: palette.border,
        borderRadius: modalRadii[appearance.modal.radius],
        color: palette.text,
        fontFamily: fontFamilies[appearance.fontFamily],
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" style={primaryStyle} disabled={state === "connecting"}>
          {label}
        </button>
        {state === "connected" ? (
          <>
            <button type="button" style={secondaryStyle}>
              Copy address
            </button>
            <button type="button" style={{ ...secondaryStyle, color: palette.danger }}>
              Disconnect
            </button>
          </>
        ) : null}
      </div>
      <p
        className="mt-2 text-xs"
        style={{ color: state === "error" ? palette.danger : palette.mutedText }}
      >
        {state === "error"
          ? "Wallet connection was rejected. Try again."
          : state === "connecting"
            ? "Opening wallet selector."
            : state === "connected"
              ? "Connected to Freighter."
              : "Wallet connection is ready."}
      </p>

      <div
        className="mt-5 border p-3"
        style={{
          background: palette.surface,
          borderColor: palette.border,
          borderRadius: modalRadii[appearance.modal.radius],
          boxShadow: shadows[appearance.modal.shadow],
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-sm">Connect Wallet</strong>
          <span aria-hidden="true">×</span>
        </div>
        {["Freighter", "Albedo", "xBull"].map((walletName, index) => (
          <div
            key={walletName}
            className="flex items-center gap-2 border-t py-2 text-sm"
            style={{ borderColor: palette.border }}
          >
            <span
              className="grid size-7 place-items-center rounded-full text-xs font-bold"
              style={{
                background: index === 0 ? palette.accent : palette.surfaceMuted,
                color: index === 0 ? palette.accentText : palette.text,
              }}
            >
              {walletName[0]}
            </span>
            {walletName}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs" style={{ color: palette.mutedText }}>
        {walletCount} wallets · {network === "public" ? "Mainnet" : "Testnet"} · {mode}
      </p>
    </div>
  );
}
