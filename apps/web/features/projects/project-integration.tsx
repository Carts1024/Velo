"use client";

import { shortenAddress } from "@/core/wallet/format";
import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import { Id } from "@repo/backend/convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { useQuery } from "convex/react";
import {
  AlertCircleIcon,
  BookOpenIcon,
  CodeIcon,
  InfoIcon,
  KeyIcon,
  TerminalIcon,
  WalletIcon,
  CheckIcon,
  CopyIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type ProjectIntegrationProps = {
  projectId: string;
};

export function ProjectIntegration({ projectId }: ProjectIntegrationProps) {
  const wallet = useWallet();
  const [selectedKeyId, setSelectedKeyId] = useState<string>("default");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const project = useQuery(
    api.projects.query.getById,
    wallet.address ? { id: projectId as Id<"projects"> } : "skip",
  );

  const apiKeys = useQuery(
    api.projects.query.listApiKeys,
    wallet.address
      ? {
          projectId: projectId as Id<"projects">,
        }
      : "skip",
  );

  const activeKeys = apiKeys?.filter((k) => !k.revoked) ?? [];

  useEffect(() => {
    const firstKey = activeKeys[0];
    if (firstKey && selectedKeyId === "default") {
      setSelectedKeyId(firstKey._id);
    }
  }, [activeKeys, selectedKeyId]);

  const selectedKey = activeKeys.find((k) => k._id === selectedKeyId) || activeKeys[0];
  const apiKeyPlaceholder = selectedKey
    ? `${selectedKey.prefix}************************`
    : "tk_live_YOUR_API_KEY";

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  if (!wallet.address) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold">Project integration</h1>
        <Alert>
          <WalletIcon />
          <AlertTitle>Connect the owner wallet</AlertTitle>
          <AlertDescription>
            Private project state loads only after wallet ownership is verified.
          </AlertDescription>
        </Alert>
        <Button onClick={wallet.connect} className="w-fit">
          <WalletIcon />
          Connect wallet
        </Button>
      </section>
    );
  }

  if (project === undefined || apiKeys === undefined) {
    return (
      <section className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

  if (project === null) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-normal">Project unavailable</h1>
        <p className="text-sm text-zinc-600">
          The project does not exist or the connected wallet is not its owner.
        </p>
        <Button asChild className="w-fit">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </section>
    );
  }

  const ownerMatches = wallet.address?.toUpperCase() === project.ownerAddress;
  if (!ownerMatches) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold">Access Denied</h1>
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Connected wallet is not the owner</AlertTitle>
          <AlertDescription>
            Switch to {shortenAddress(project.ownerAddress)} to view this page.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const nodeSnippet = `const response = await fetch("${baseUrl}/api/v1/payment-intents", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKeyPlaceholder}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    amount: "10.00",
    asset: "native", // "native" for XLM, or "CODE:ISSUER" for custom assets (e.g. USDC)
    description: "Order #1001",
    successUrl: "https://your-merchant-site.com/success",
    cancelUrl: "https://your-merchant-site.com/cancel"
  })
});

const data = await response.json();
if (response.ok) {
  // Redirect customer to hosted checkout page
  window.location.href = data.checkoutUrl;
} else {
  console.error("Payment creation failed:", data.error);
}`;

  const sdkSnippet = `import { Velo } from "@carts1024/velo-sdk";

const velo = new Velo({
  apiKey: "${apiKeyPlaceholder}",
  environment: "testnet", // "production", "testnet", or "development"
  baseUrl: "${baseUrl}" // Optional: custom backend URL
});

try {
  const session = await velo.checkout.sessions.create({
    amount: "10.00",
    asset: "USDC", // "native" for XLM, or "USDC"
    description: "Order #1001",
    successUrl: "https://your-merchant-site.com/success",
    cancelUrl: "https://your-merchant-site.com/cancel",
  });

  // Redirect customer to hosted checkout page
  window.location.href = session.checkoutUrl;
} catch (error) {
  console.error("Failed to initiate Velo Pay checkout:", error);
}`;

  const nextSnippet = `import { NextResponse } from "next/server";
import { Velo } from "@carts1024/velo-sdk";

const velo = new Velo({
  apiKey: process.env.VELO_API_KEY || "${apiKeyPlaceholder}",
  environment: "testnet",
  baseUrl: "${baseUrl}"
});

export async function POST() {
  try {
    const session = await velo.checkout.sessions.create({
      amount: "10.00",
      asset: "USDC",
      description: "Order #1001",
      successUrl: "https://your-merchant-site.com/success",
      cancelUrl: "https://your-merchant-site.com/cancel",
    });

    return NextResponse.json({ url: session.checkoutUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}`;

  const curlCommand = `curl -X POST ${baseUrl}/api/v1/payment-intents \\
  -H "Authorization: Bearer ${apiKeyPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "10.00",
    "asset": "native",
    "description": "Order #1001",
    "successUrl": "https://merchant.example/success",
    "cancelUrl": "https://merchant.example/cancel"
  }'`;

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Developer Integration</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Learn how to create checkout sessions programmatically and integrate Velo Pay into your
            server or backend.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/projects/${projectId}/api-keys`}>API keys</Link>
        </Button>
      </div>

      {activeKeys.length === 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <KeyIcon className="size-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">API Key Required</AlertTitle>
          <AlertDescription className="text-amber-800">
            <p className="text-xs leading-relaxed">
              You need an active API key to populate integration snippets. Go to the{" "}
              <Link
                href={`/projects/${projectId}/api-keys`}
                className="underline font-semibold hover:text-amber-950"
              >
                API keys page
              </Link>{" "}
              to generate one.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-normal flex items-center gap-1.5 text-zinc-800">
                <KeyIcon className="size-4 text-zinc-500" />
                Select API Key for code generation
              </h2>
              <p className="text-xs text-zinc-500">
                The chosen key will be automatically injected into the integration snippets below.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select API Key" />
                </SelectTrigger>
                <SelectContent>
                  {activeKeys.map((key) => (
                    <SelectItem key={key._id} value={key._id}>
                      {key.label} ({key.prefix}...)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Main Integration Code Snippet section */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex items-center gap-2">
          <CodeIcon className="size-5 text-zinc-500" />
          <span className="font-semibold text-sm text-zinc-800">Integration Snippets</span>
        </div>

        <Tabs defaultValue="node" className="w-full">
          <div className="border-b border-zinc-150 px-4">
            <TabsList variant="line" className="h-10">
              <TabsTrigger value="node" className="text-xs">
                Node.js (Fetch)
              </TabsTrigger>
              <TabsTrigger value="sdk" className="text-xs">
                SDK Helper
              </TabsTrigger>
              <TabsTrigger value="next" className="text-xs">
                Next.js API Route
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 bg-zinc-950">
            <TabsContent value="node" className="relative group mt-0">
              <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                  onClick={() => handleCopy(nodeSnippet, "node")}
                >
                  {copiedText === "node" ? (
                    <CheckIcon className="size-4 text-emerald-500" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              </div>
              <pre className="font-mono text-xs text-zinc-100 overflow-x-auto whitespace-pre p-2 bg-transparent select-all leading-relaxed">
                {nodeSnippet}
              </pre>
            </TabsContent>

            <TabsContent value="sdk" className="relative group mt-0">
              <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                  onClick={() => handleCopy(sdkSnippet, "sdk")}
                >
                  {copiedText === "sdk" ? (
                    <CheckIcon className="size-4 text-emerald-500" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              </div>
              <pre className="font-mono text-xs text-zinc-100 overflow-x-auto whitespace-pre p-2 bg-transparent select-all leading-relaxed">
                {sdkSnippet}
              </pre>
            </TabsContent>

            <TabsContent value="next" className="relative group mt-0">
              <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                  onClick={() => handleCopy(nextSnippet, "next")}
                >
                  {copiedText === "next" ? (
                    <CheckIcon className="size-4 text-emerald-500" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              </div>
              <pre className="font-mono text-xs text-zinc-100 overflow-x-auto whitespace-pre p-2 bg-transparent select-all leading-relaxed">
                {nextSnippet}
              </pre>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Local Sandbox / Sandbox Testing section */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex items-center gap-2">
          <TerminalIcon className="size-5 text-zinc-500" />
          <span className="font-semibold text-sm text-zinc-800">Local cURL Sandbox Testing</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-zinc-700 space-y-2">
            <p>
              To quickly test checkout creation without writing code, execute this `curl` command in
              your terminal. It will trigger our backend endpoints to create a new checkout session
              on the fly.
            </p>
            <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded p-3 text-xs">
              <InfoIcon className="size-4.5 shrink-0 mt-0.5 text-amber-600" />
              <p>
                Ensure your project is **registered** on-chain and **Velo Pay Access** is **active**
                (which funds the project with checkout credits) prior to running calls.
              </p>
            </div>
          </div>

          <div className="relative group bg-zinc-950 p-4 rounded-lg">
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                onClick={() => handleCopy(curlCommand, "curl")}
              >
                {copiedText === "curl" ? (
                  <CheckIcon className="size-4 text-emerald-500" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
            <pre className="font-mono text-xs text-zinc-100 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed">
              {curlCommand}
            </pre>
          </div>

          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Response payload
            </h3>
            <p className="text-xs text-zinc-600">
              The API returns a JSON response containing the `checkoutUrl` to redirect your buyer,
              the `paymentIntentId`, and the lifespan of the payment link in seconds:
            </p>
            <pre className="bg-zinc-50 border border-zinc-150 p-3 rounded font-mono text-xs text-zinc-800">
              {`{
  "paymentIntentId": "kh7acnc4nk9v5nwj9xbnhsaj9x89jw2q",
  "checkoutUrl": "${baseUrl}/pay/kh7acnc4nk9v5nwj9xbnhsaj9x89jw2q",
  "expiresIn": 1800
}`}
            </pre>
          </div>
        </div>
      </div>

      <div className="flex gap-2 items-center text-xs text-zinc-500 justify-center py-4 border-t border-zinc-200">
        <BookOpenIcon className="size-4" />
        <span>
          For full specs on parameters and status values, see the{" "}
          <Link href="/verify/demo" className="underline hover:text-zinc-800">
            Velo Pay Checkout Guide
          </Link>
          .
        </span>
      </div>
    </section>
  );
}
