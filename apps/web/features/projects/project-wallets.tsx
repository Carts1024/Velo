"use client";

import { env } from "@/core/config/env";
import { useWallet } from "@/core/wallet/wallet-provider";
import {
  draftFromDocument,
  parseOriginLines,
  walletIntegrationSnippets,
} from "@/features/projects/wallet-config-form";
import {
  DEFAULT_WALLET_CONFIG,
  validateWalletDraft,
  WALLET_CATALOG,
  type WalletDraftConfig,
} from "@carts1024/velo-wallets/config";
import { api } from "@repo/backend/convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
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
import { useEffect, useMemo, useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

type SaveState =
  | "draft"
  | "unsaved"
  | "saving"
  | "publishing"
  | "published"
  | "disabled"
  | "failed";

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

  useEffect(() => {
    if (stored) {
      setDraft(draftFromDocument(stored));
      setSaveState(
        stored.enabled ? "published" : stored.activePublicationId ? "disabled" : "draft",
      );
    }
  }, [stored]);

  const errors = useMemo(() => validateWalletDraft(draft), [draft]);
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

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-lg border bg-white p-5">
            <Label htmlFor="wallet-network">Network</Label>
            <select
              id="wallet-network"
              value={draft.network}
              onChange={(event) =>
                updateDraft({ network: event.target.value as WalletDraftConfig["network"] })
              }
              className="mt-2 h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="testnet">Testnet</option>
              <option value="public">Mainnet</option>
            </select>
            {draft.network === "public" ? (
              <p className="mt-2 text-xs text-amber-700">
                Mainnet requires a non-local HTTPS origin and typed confirmation.
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border bg-white p-5">
            <Label htmlFor="wallet-theme">Theme</Label>
            <select
              id="wallet-theme"
              value={draft.theme}
              onChange={(event) =>
                updateDraft({ theme: event.target.value as WalletDraftConfig["theme"] })
              }
              className="mt-2 h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
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
          <h2 className="font-semibold">Component preview</h2>
          <div
            className={
              draft.theme === "dark"
                ? "mt-4 rounded-lg bg-zinc-950 p-5 text-white"
                : "mt-4 rounded-lg bg-zinc-50 p-5 text-zinc-950"
            }
          >
            <button
              type="button"
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white"
            >
              {draft.buttonLabel || "Connect wallet"}
            </button>
            <p className="mt-3 text-xs opacity-70">
              {draft.walletIds.length} wallets ·{" "}
              {draft.network === "public" ? "Mainnet" : "Testnet"}
            </p>
          </div>
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
