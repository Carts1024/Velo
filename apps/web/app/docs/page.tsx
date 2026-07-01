"use client";

import {
  CheckIcon,
  CopyIcon,
  InfoIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  HashIcon,
  KeyIcon,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

type SectionId =
  | "intro"
  | "install"
  | "config"
  | "checkouts"
  | "intents"
  | "webhooks"
  | "nextjs"
  | "express"
  | "reference";

interface DocSection {
  id: SectionId;
  title: string;
  category: "Getting Started" | "SDK Reference" | "Guides & Examples" | "API Reference";
}

const SECTIONS: DocSection[] = [
  { id: "intro", title: "Introduction", category: "Getting Started" },
  { id: "install", title: "Installation", category: "Getting Started" },
  { id: "config", title: "Configuration", category: "Getting Started" },
  { id: "checkouts", title: "Checkout Sessions", category: "SDK Reference" },
  { id: "intents", title: "Payment Intents", category: "SDK Reference" },
  { id: "webhooks", title: "Webhook Verification", category: "SDK Reference" },
  { id: "nextjs", title: "Next.js App Router", category: "Guides & Examples" },
  { id: "express", title: "Express Server", category: "Guides & Examples" },
  { id: "reference", title: "Errors & Limitations", category: "API Reference" },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("intro");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const currentSection = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0]!;

  const codeSnippets = {
    installNpm: `npm install @velo/sdk`,
    installPnpm: `pnpm add @velo/sdk`,
    installYarn: `yarn add @velo/sdk`,
    initClient: `import { Velo } from "@velo/sdk";

const velo = new Velo({
  apiKey: process.env.VELO_API_KEY!,
  environment: "testnet", // 'production' | 'testnet' | 'development'
  timeoutMs: 10000,       // optional timeout (default 10s)
});`,
    createCheckout: `const session = await velo.checkout.sessions.create(
  {
    amount: "10.00",
    asset: "USDC", // 'USDC' or 'native'
    description: "Order #1001",
    successUrl: "https://your-merchant-site.com/success",
    cancelUrl: "https://your-merchant-site.com/cancel",
  },
  {
    idempotencyKey: "unique-order-key-1001", // Optional but highly recommended
  }
);

// Redirect the customer to: session.checkoutUrl`,
    retrieveIntent: `const intent = await velo.paymentIntents.retrieve("pi_12345");
console.log(\`Payment status: \${intent.status}\`);`,
    listIntents: `const page = await velo.paymentIntents.list({
  status: "paid",
  limit: 10,
  cursor: "opaque_cursor_value" // for pagination
});

console.log(\`Found \${page.data.length} payment intents.\`);
if (page.hasMore) {
  const nextCursor = page.nextCursor;
  // load next page...
}`,
    webhookVerify: `import { Velo } from "@velo/sdk";

// rawBody must be the raw, unparsed request body string
const event = await Velo.webhooks.verify({
  payload: rawBody,
  signature: request.headers["x-velo-signature"],
  secret: process.env.VELO_WEBHOOK_SECRET!,
  toleranceSeconds: 300, // optional (defaults to 5 minutes)
});

if (event.type === "payment.succeeded") {
  const paymentIntent = event.paymentIntent;
  console.log(\`Payment succeeded! ID: \${paymentIntent.id}\`);
}`,
    nextjsCode: `// app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { Velo } from "@velo/sdk";

const velo = new Velo({
  apiKey: process.env.VELO_API_KEY!,
  environment: "testnet",
});

export async function POST() {
  try {
    const session = await velo.checkout.sessions.create({
      amount: "10.00",
      asset: "USDC",
      description: "Order #1001",
      successUrl: "https://yourdomain.com/success",
      cancelUrl: "https://yourdomain.com/cancel",
    }, {
      idempotencyKey: \`order-1001-\${Date.now()}\`
    });

    return NextResponse.json({ url: session.checkoutUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Checkout error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}`,
    nextjsWebhook: `// app/api/webhook/route.ts
import { NextResponse } from "next/server";
import { Velo } from "@velo/sdk";

export async function POST(request: Request) {
  // Retrieve the RAW body text for signature checking
  const payload = await request.text();
  const signature = request.headers.get("x-velo-signature");
  const secret = process.env.VELO_WEBHOOK_SECRET!;

  try {
    const event = await Velo.webhooks.verify({
      payload,
      signature,
      secret,
    });

    if (event.type === "payment.succeeded") {
      console.log(\`Order paid: \${event.paymentIntent.id}\`);
      // Fulfill order
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Signature check failed:", err);
    return new NextResponse("Invalid Signature", { status: 400 });
  }
}`,
    expressCode: `// server.ts
import express from "express";
import { Velo } from "@velo/sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const velo = new Velo({ apiKey: process.env.VELO_API_KEY! });

app.use(express.json());

// 1. Checkout session route
app.post("/api/checkout", async (req, res) => {
  try {
    const session = await velo.checkout.sessions.create({
      amount: "10.00",
      asset: "USDC",
      description: "Order #1001",
      successUrl: "https://yourdomain.com/success",
      cancelUrl: "https://yourdomain.com/cancel",
    }, {
      idempotencyKey: req.body.orderId,
    });

    res.status(201).json({ url: session.checkoutUrl });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 2. Webhook route capturing raw body string
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const payload = req.body.toString("utf8");
  const signature = req.headers["x-velo-signature"];
  const secret = process.env.VELO_WEBHOOK_SECRET!;

  try {
    const event = await Velo.webhooks.verify({
      payload,
      signature: Array.isArray(signature) ? signature[0] : signature || "",
      secret,
    });

    if (event.type === "payment.succeeded") {
      console.log(\`Paid: \${event.paymentIntent.id}\`);
    }

    res.status(200).send("OK");
  } catch (err) {
    res.status(400).send("Verification failed");
  }
});

app.listen(3001, () => console.log("Express server running on port 3001"));`,
  };

  const categories = Array.from(new Set(SECTIONS.map((s) => s.category)));

  const renderCodeBlock = (code: string, id: string) => {
    const isCopied = copiedText === id;
    return (
      <div className="relative group rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm my-4">
        <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => handleCopy(code, id)}
            className="flex items-center justify-center h-8 w-8 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-all shadow-md"
            title="Copy to clipboard"
          >
            {isCopied ? (
              <CheckIcon size={14} className="text-emerald-500" />
            ) : (
              <CopyIcon size={14} />
            )}
          </button>
        </div>
        <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-100 leading-relaxed select-all">
          {code}
        </pre>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ArrowLeftIcon size={16} />
            <img src="/iconv2.png" alt="Velo Logo" className="h-6 w-6 rounded" />
          </Link>
          <span className="text-sm font-semibold tracking-tight text-zinc-300">Velo SDK Docs</span>
          <span className="text-[10px] font-mono uppercase bg-zinc-900 text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded font-bold">
            0.1.0-alpha.1
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all hover:bg-zinc-800"
          >
            Launch Console
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 gap-8">
        {/* Left Sidebar */}
        <aside className="w-64 shrink-0 hidden md:block border-r border-zinc-900 pr-6 h-[calc(100vh-120px)] sticky top-24 overflow-y-auto">
          <div className="space-y-6">
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 font-mono">
                  {cat}
                </h3>
                <ul className="space-y-1">
                  {SECTIONS.filter((s) => s.category === cat).map((s) => {
                    const isActive = s.id === activeSection;
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => setActiveSection(s.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all flex items-center justify-between ${
                            isActive
                              ? "bg-zinc-900 text-white font-medium border-l-2 border-white"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                          }`}
                        >
                          <span>{s.title}</span>
                          {isActive && <ChevronRightIcon size={12} className="text-zinc-400" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Content Panel */}
        <main className="flex-1 min-w-0 pb-16">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 mb-2">
            <span>Docs</span>
            <ChevronRightIcon size={10} />
            <span>{currentSection.category}</span>
            <ChevronRightIcon size={10} />
            <span className="text-zinc-300">{currentSection.title}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-6">
            {currentSection.title}
          </h1>

          {/* Render Active Section Content */}
          <div className="prose prose-invert max-w-none text-zinc-300 text-sm sm:text-base leading-relaxed space-y-6">
            {activeSection === "intro" && (
              <>
                <p>
                  Welcome to the **Velo SDK for Node.js** documentation. The Velo SDK is a
                  server-side alpha package designed to streamline checkout session creation,
                  payment state verification, and webhook handling.
                </p>
                <p>
                  By wrapping Velo's secure REST endpoints, the SDK allows you to handle stablecoin
                  payments (like USDC) on Stellar without exposing raw keys to frontend code,
                  dealing with direct HTTP headers, or leaking project details to users.
                </p>

                <div className="flex gap-3 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 my-6">
                  <InfoIcon className="size-5 shrink-0 text-zinc-400 mt-0.5" />
                  <div className="text-sm">
                    <strong className="text-white block mb-1">Target Developer Journey</strong>
                    Initialize a Velo client on your server and generate secure payment links in
                    seconds:
                  </div>
                </div>

                {renderCodeBlock(
                  `import { Velo } from "@velo/sdk";

const velo = new Velo({ apiKey: process.env.VELO_API_KEY! });
const session = await velo.checkout.sessions.create({
  amount: "10.00",
  asset: "USDC",
  description: "Order #1001"
});

// redirect the user to session.checkoutUrl`,
                  "introDemo",
                )}

                <h3 className="text-lg font-bold text-white mt-8 mb-3 flex items-center gap-2">
                  <HashIcon size={16} className="text-zinc-500" />
                  Key Features
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-zinc-400">
                  <li>
                    **Class-Based API Client**: Strongly typed request validation and normalization.
                  </li>
                  <li>
                    **Secure Webhook Signatures**: Built-in HMAC-SHA256 timestamped verification.
                  </li>
                  <li>
                    **Idempotent API Requests**: Avoid duplicate charges during transaction retries.
                  </li>
                  <li>
                    **Cursor Pagination**: Seamless listing and reconciliation of payment intents.
                  </li>
                </ul>
              </>
            )}

            {activeSection === "install" && (
              <>
                <p>
                  Install the Velo SDK into your server environment using your favorite package
                  manager:
                </p>

                <h4 className="text-sm font-semibold uppercase text-zinc-400 font-mono mt-6">
                  npm
                </h4>
                {renderCodeBlock(codeSnippets.installNpm, "npmInstall")}

                <h4 className="text-sm font-semibold uppercase text-zinc-400 font-mono mt-6">
                  pnpm
                </h4>
                {renderCodeBlock(codeSnippets.installPnpm, "pnpmInstall")}

                <h4 className="text-sm font-semibold uppercase text-zinc-400 font-mono mt-6">
                  Yarn
                </h4>
                {renderCodeBlock(codeSnippets.installYarn, "yarnInstall")}

                <div className="bg-amber-950/20 border border-amber-900/60 text-amber-300 rounded-xl p-4 my-6 flex gap-3">
                  <AlertTriangleIcon className="size-5 shrink-0 mt-0.5 text-amber-500" />
                  <div className="text-sm">
                    <strong>Server-Side Only Requirement</strong>
                    <p className="mt-1">
                      This package uses sensitive API credentials and is meant for **Node.js 18+
                      server environments only**. Do not include this SDK in frontend code or client
                      bundles as it will expose your private key to the web.
                    </p>
                  </div>
                </div>
              </>
            )}

            {activeSection === "config" && (
              <>
                <p>
                  To use the SDK, import `Velo` and initialize the client constructor. You must
                  supply your private API key (`VELO_API_KEY`).
                </p>

                {renderCodeBlock(codeSnippets.initClient, "initDemo")}

                <h3 className="text-lg font-bold text-white mt-8 mb-4">
                  Client Initialization Configuration
                </h3>
                <div className="overflow-x-auto border border-zinc-800 rounded-lg">
                  <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-mono text-xs">
                      <tr>
                        <th className="px-4 py-3">Property</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Required</th>
                        <th className="px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      <tr>
                        <td className="px-4 py-3 font-mono text-white font-semibold">apiKey</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">string</td>
                        <td className="px-4 py-3 text-red-500">Yes</td>
                        <td className="px-4 py-3">
                          Your private Velo project key. (e.g. `tk_live_...`)
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-white">environment</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          "production" | "testnet" | "development"
                        </td>
                        <td className="px-4 py-3 text-zinc-500">No</td>
                        <td className="px-4 py-3">
                          Defaults to `"testnet"`. Routes requests to the corresponding backend
                          network.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-white">baseUrl</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">string</td>
                        <td className="px-4 py-3 text-zinc-500">No</td>
                        <td className="px-4 py-3">
                          Overrides the target API server URL. Mainly used for local development and
                          sandbox setups.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-white">timeoutMs</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">number</td>
                        <td className="px-4 py-3 text-zinc-500">No</td>
                        <td className="px-4 py-3">
                          Specifies maximum connection wait time (defaults to `10000` / 10s).
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeSection === "checkouts" && (
              <>
                <p>
                  Checkout sessions are the easiest way to accept payments. By creating a checkout
                  session, you generate a secure hosted Velo checkout URL where customers connect
                  their wallet, sign, and pay on-chain.
                </p>

                {renderCodeBlock(codeSnippets.createCheckout, "createCheckoutDemo")}

                <h3 className="text-lg font-bold text-white mt-8 mb-4">Request Parameters</h3>
                <div className="overflow-x-auto border border-zinc-800 rounded-lg">
                  <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-mono text-xs">
                      <tr>
                        <th className="px-4 py-3">Parameter</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Required</th>
                        <th className="px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      <tr>
                        <td className="px-4 py-3 font-mono text-white font-semibold">amount</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">string</td>
                        <td className="px-4 py-3 text-red-500">Yes</td>
                        <td className="px-4 py-3">
                          The dollar amount to charge. Must be positive (e.g. `"10.00"`).
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-white">asset</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">string</td>
                        <td className="px-4 py-3 text-zinc-500">No</td>
                        <td className="px-4 py-3">
                          Defaults to `"USDC"`. Asset to charge. Can be `"USDC"` or `"native"`
                          (XLM).
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-white">description</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">string</td>
                        <td className="px-4 py-3 text-zinc-500">No</td>
                        <td className="px-4 py-3">
                          Order metadata shown to the user during checkout (e.g. `"Order #1001"`).
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-white">successUrl</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">string</td>
                        <td className="px-4 py-3 text-zinc-500">No</td>
                        <td className="px-4 py-3">
                          URL to redirect the customer to after a successful transaction.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-white">cancelUrl</td>
                        <td className="px-4 py-3 font-mono text-zinc-400">string</td>
                        <td className="px-4 py-3 text-zinc-500">No</td>
                        <td className="px-4 py-3">
                          URL to redirect the customer to if they cancel checkout.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 my-6">
                  <KeyIcon className="size-5 shrink-0 text-zinc-400 mt-0.5" />
                  <div className="text-sm">
                    <strong className="text-white block mb-1">Idempotency-Key Option</strong>
                    To avoid duplicate sessions or payments under network failures, supply an
                    optional `idempotencyKey` inside the second parameter `RequestOptions`.
                  </div>
                </div>
              </>
            )}

            {activeSection === "intents" && (
              <>
                <p>
                  Underneath every checkout session is a **Payment Intent**. Use payment intent
                  methods to fetch transaction details or run reconciliation reports on your server.
                </p>

                <h3 className="text-lg font-bold text-white mt-8 mb-3">
                  Retrieve a Payment Intent
                </h3>
                <p>Fetch details for a specific payment intent by passing its unique identifier:</p>
                {renderCodeBlock(codeSnippets.retrieveIntent, "retrieveDemo")}

                <h3 className="text-lg font-bold text-white mt-8 mb-3">List Payment Intents</h3>
                <p>
                  Retrieve a list of payment intents. Results are filtered by your project scope,
                  sorted newest first, and support cursor-based pagination:
                </p>
                {renderCodeBlock(codeSnippets.listIntents, "listDemo")}

                <h3 className="text-lg font-bold text-white mt-8 mb-4">Response Object Shape</h3>
                <pre className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-x-auto text-[13px] font-mono text-zinc-300">
                  {`{
  id: "pi_12345",
  object: "payment_intent",
  paymentIntentId: "pi_12345",
  status: "paid", // "created" | "pending" | "paid" | "failed" | "expired" | "cancelled"
  amount: "10.00",
  asset: "USDC",
  description: "Order #1001",
  checkoutUrl: "https://pay.velo.xyz/pay/pi_12345",
  successUrl: "https://yourdomain.com/success",
  cancelUrl: "https://yourdomain.com/cancel",
  expiresAt: "2026-07-01T00:30:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:05:00.000Z"
}`}
                </pre>
              </>
            )}

            {activeSection === "webhooks" && (
              <>
                <p>
                  Velo sends webhook events to your server to notify you about payment lifecycle
                  changes. To prevent request spoofing, you must verify the signature header.
                </p>

                <div className="bg-red-950/20 border border-red-900/60 text-red-300 rounded-xl p-4 my-6 flex gap-3">
                  <AlertTriangleIcon className="size-5 shrink-0 mt-0.5 text-red-500" />
                  <div className="text-sm">
                    <strong>CRITICAL: Use the RAW request body</strong>
                    <p className="mt-1">
                      Webhook verification fails if the body payload has been parsed (e.g. via
                      `body-parser` JSON middleware). **Always pass the raw request text string**
                      directly.
                    </p>
                  </div>
                </div>

                <p>Verify webhook signatures using the static `Velo.webhooks.verify` method:</p>

                {renderCodeBlock(codeSnippets.webhookVerify, "verifyDemo")}

                <h3 className="text-lg font-bold text-white mt-8 mb-4">Supported Event Types</h3>
                <ul className="list-disc pl-6 space-y-2 text-zinc-400">
                  <li>
                    <strong className="text-white">payment.created</strong>: Emitted when a payment
                    intent is created.
                  </li>
                  <li>
                    <strong className="text-white">payment.succeeded</strong>: Emitted when the user
                    completes payment on-chain and tokens are confirmed.
                  </li>
                  <li>
                    <strong className="text-white">payment.failed</strong>: Emitted when the payment
                    transaction fails.
                  </li>
                  <li>
                    <strong className="text-white">payment_access.activated</strong>: Emitted when
                    project pay credits are added.
                  </li>
                </ul>
              </>
            )}

            {activeSection === "nextjs" && (
              <>
                <p>
                  Here is a complete Next.js App Router integration. It features a backend checkout
                  endpoint `/api/checkout` and a webhook receiver endpoint `/api/webhook` utilizing
                  the Velo SDK.
                </p>

                <h3 className="text-lg font-bold text-white mt-8 mb-3">
                  1. Checkout Route Handler
                </h3>
                {renderCodeBlock(codeSnippets.nextjsCode, "nextCheckoutCode")}

                <h3 className="text-lg font-bold text-white mt-8 mb-3">
                  2. Webhook Verification Handler
                </h3>
                {renderCodeBlock(codeSnippets.nextjsWebhook, "nextWebhookCode")}
              </>
            )}

            {activeSection === "express" && (
              <>
                <p>
                  Here is a complete Express.js server example written in TypeScript. We configure
                  the webhook endpoint `/webhooks` to capture the raw body as a string using the
                  `express.raw` parser middleware.
                </p>

                {renderCodeBlock(codeSnippets.expressCode, "expressDemo")}
              </>
            )}

            {activeSection === "reference" && (
              <>
                <p>
                  Here are details on error models, environments, and general Velo SDK alpha release
                  limits.
                </p>

                <h3 className="text-lg font-bold text-white mt-8 mb-3">Error Handling</h3>
                <p>
                  SDK calls that fail server-side throw specific errors inheriting from
                  `VeloAPIError`. Catch them to trigger targeted retry or authentication actions:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-zinc-400">
                  <li>
                    <strong className="text-white">VeloAuthError</strong> (Status `401`): Invalid or
                    missing API key.
                  </li>
                  <li>
                    <strong className="text-white">VeloValidationError</strong> (Status `400` /
                    `422`): Malformed parameters, invalid numbers.
                  </li>
                  <li>
                    <strong className="text-white">VeloRateLimitError</strong> (Status `429`):
                    Request rate limits exceeded. Look at the `Retry-After` header.
                  </li>
                  <li>
                    <strong className="text-white">VeloAPIError</strong> (Status `409` / `500`):
                    Generic API issues or Idempotency Key conflicts.
                  </li>
                </ul>

                <h3 className="text-lg font-bold text-white mt-8 mb-3">
                  Alpha Exclusions & Boundaries
                </h3>
                <p>During the alpha stage, the following features are not supported:</p>
                <ul className="list-disc pl-6 space-y-1 text-zinc-400">
                  <li>Refunds, partial captures, and disputes</li>
                  <li>Direct client-side / browser usage</li>
                  <li>React front-end checkout button components</li>
                  <li>Automatic request retry on creation</li>
                </ul>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
