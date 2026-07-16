"use client";

import { api } from "@repo/backend/convex/_generated/api";
import { Id } from "@repo/backend/convex/_generated/dataModel";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { cn } from "@repo/ui/lib/utils";
import { useAction, useQuery } from "convex/react";
import {
  CheckCircle2Icon,
  ClockIcon,
  CoinsIcon,
  RefreshCwIcon,
  Building2Icon,
  SendIcon,
  InfoIcon,
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  HistoryIcon,
  ActivityIcon,
  SearchIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
  CheckIcon,
  XCircleIcon,
  BookOpenIcon,
  ChevronUpIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type ProjectSettlementProps = {
  projectId: string;
};

type BalanceItem = {
  currency: string;
  available: string;
  hold: string;
  total: string;
  asset_type: string;
};

interface PdaxFirmQuote {
  quote_id: string;
  expires_at: string;
  quote_currency: string;
  base_currency: string;
  side: "buy" | "sell";
  base_quantity: number;
  price: number;
  total_amount: number;
}

interface PdaxOrderDetails {
  order_id: number;
  status: string;
  quote_currency: string;
  base_currency: string;
  side: "buy" | "sell";
  base_quantity: number;
  price: number;
  total_amount: number;
  created_at: string;
}

interface PdaxFiatWithdrawData {
  identifier: string;
  reference_number: string;
  amount: number;
  method: string;
  status: string;
  fee: number;
}

type SettlementOperationResult<T> =
  | { state: "succeeded"; operationId: Id<"providerOperations">; replay: boolean; data: T }
  | { state: "in_progress"; operationId: Id<"providerOperations">; retryAfterMs: number }
  | { state: "recovery_required"; operationId: Id<"providerOperations"> };

const BANK_TEST_ACCOUNTS = {
  BASECPH: {
    name: "Security Bank",
    number: "0000042001461",
  },
  BACTBPH: {
    name: "CTBC Bank",
    number: "001700062270",
  },
} as const;

function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  disabled = false,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: string[];
  placeholder: string;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <Label className="text-xs font-medium text-zinc-500 uppercase">{label}</Label>
      <button
        onClick={() => {
          if (!disabled) {
            setOpen(!open);
            setSearch("");
          }
        }}
        disabled={disabled}
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left mt-1.5 border-zinc-200"
      >
        <span>{value || placeholder}</span>
        <ChevronDownIcon className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 min-w-[8rem] w-full overflow-hidden rounded-md border border-zinc-200 bg-card text-card-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-100 mt-1 max-h-60 flex flex-col">
          <div className="flex items-center border-b border-zinc-100 px-3 py-2">
            <SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              className="flex h-6 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search options"
            />
          </div>
          <div className="overflow-y-auto max-h-48 p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    onValueChange(opt);
                    setOpen(false);
                  }}
                  type="button"
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                    opt === value && "bg-accent/50 font-medium",
                  )}
                >
                  <span className="flex-1">{opt}</span>
                  {opt === value && <CheckIcon className="h-4 w-4" />}
                </button>
              ))
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectSettlement({ projectId }: ProjectSettlementProps) {
  const typedProjectId = projectId as Id<"projects">;
  const project = useQuery(api.projects.query.getById, { id: typedProjectId });
  const connection = useQuery(api.provider_connections.query.getByProject, {
    projectId: typedProjectId,
  });
  const transactions = useQuery(api.settlement_transactions.query.listByProject, {
    projectId: typedProjectId,
  });
  const webhookDeliveries = useQuery(api.webhook_deliveries.query.listByProject, {
    projectId: typedProjectId,
    limit: 10,
  });

  const connectAction = useAction(api.settlement.actions.connect);
  const getBalancesAction = useAction(api.settlement.actions.getBalances);
  const getQuoteAction = useAction(api.settlement.actions.getQuote);
  const executeTradeAction = useAction(api.settlement.actions.executeTrade);
  const fiatWithdrawAction = useAction(api.settlement.actions.fiatWithdraw);
  const mockWebhookAction = useAction(api.settlement.actions.mockPdaxWebhook);
  const registerWebhookAction = useAction(api.settlement.actions.registerWebhook);
  const checkPayoutStatusAction = useAction(api.settlement.actions.checkPayoutStatus);

  const [showDemoGuide, setShowDemoGuide] = useState(false);

  // Balances state
  const [balances, setBalances] = useState<BalanceItem[] | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"currency" | "available" | "hold" | "total" | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const availableAssets = Array.from(
    new Set(["PHP", "USDCXLM", "XLM", ...(balances ? balances.map((b) => b.currency) : [])]),
  );

  const handleSort = (field: "currency" | "available" | "hold" | "total") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredAndSortedBalances = (balances || [])
    .filter((item) => item.currency.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (!sortField) return 0;

      let valA: string | number = a[sortField];
      let valB: string | number = b[sortField];

      if (sortField !== "currency") {
        valA = parseFloat(valA);
        valB = parseFloat(valB);
      } else {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

  // Connection state
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Quote flow state
  const [quoteQuantity, setQuoteQuantity] = useState("10");
  const [fromAsset, setFromAsset] = useState("USDCXLM");
  const [toAsset, setToAsset] = useState("PHP");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<PdaxFirmQuote | null>(null);
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<number | null>(null);
  const [quoteSecondsLeft, setQuoteSecondsLeft] = useState<number>(0);

  const isDirectCryptoToCrypto = fromAsset !== "PHP" && toAsset !== "PHP";
  const isSameAsset = fromAsset === toAsset;
  const isQuoteDisabled = isDirectCryptoToCrypto || isSameAsset || quoteLoading;

  // Trade flow state
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeInfo, setTradeInfo] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<PdaxOrderDetails | null>(null);
  const [tradeOperationId, setTradeOperationId] = useState<Id<"providerOperations"> | null>(null);
  const tradeIdempotencyKey = useRef<string | null>(null);
  const tradeOperation = useQuery(
    api.provider_operations.queries.get,
    tradeOperationId ? { operationId: tradeOperationId } : "skip",
  );

  // Withdrawal flow state
  const [withdrawBank, setWithdrawBank] = useState("BASECPH");
  const withdrawAccountName = "John Doe";
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState<string>(
    BANK_TEST_ACCOUNTS.BASECPH.number,
  );
  const [withdrawAmount, setWithdrawAmount] = useState("500");
  const [withdrawFirstName, setWithdrawFirstName] = useState("John");
  const [withdrawLastName, setWithdrawLastName] = useState("Doe");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawInfo, setWithdrawInfo] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<PdaxFiatWithdrawData | null>(null);
  const [withdrawOperationId, setWithdrawOperationId] = useState<Id<"providerOperations"> | null>(
    null,
  );
  const withdrawIdempotencyKey = useRef<string | null>(null);
  const withdrawOperation = useQuery(
    api.provider_operations.queries.get,
    withdrawOperationId ? { operationId: withdrawOperationId } : "skip",
  );

  // Webhook Simulator state
  const [simIdentifier, setSimIdentifier] = useState("");
  const [simStatus, setSimStatus] = useState("COMPLETED");
  const [simAmount, setSimAmount] = useState("500");
  const simFee = "15";
  const [simLoading, setSimLoading] = useState(false);
  const [simSuccess, setSimSuccess] = useState(false);

  // Payout status refresh state
  const [refreshingPayoutId, setRefreshingPayoutId] = useState<string | null>(null);
  const [refreshAllLoading, setRefreshAllLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Auto-fill account number based on selected bank
  const handleBankChange = (bankCode: string) => {
    setWithdrawBank(bankCode);
    const testAccount = BANK_TEST_ACCOUNTS[bankCode as keyof typeof BANK_TEST_ACCOUNTS];
    if (testAccount) {
      setWithdrawAccountNumber(testAccount.number);
    }
  };

  const refreshBalances = useCallback(
    async (showToast = false) => {
      if (connection?.status !== "connected") return;
      setBalancesLoading(true);
      setBalancesError(null);
      if (showToast) {
        toast.loading("Refreshing balances...", { id: "pdax-balances" });
      }
      try {
        const res = (await getBalancesAction({ projectId: typedProjectId })) as BalanceItem[];
        setBalances(res);
        if (showToast) {
          toast.success("Balances refreshed successfully!", { id: "pdax-balances" });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to fetch balances";
        setBalancesError(msg);
        if (showToast) {
          toast.error("Failed to refresh balances: " + msg, { id: "pdax-balances" });
        }
      } finally {
        setBalancesLoading(false);
      }
    },
    [typedProjectId, connection?.status, getBalancesAction],
  );

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    if (!tradeOperation) return;
    if (tradeOperation.state === "succeeded" && tradeOperation.resultJson) {
      const trade = JSON.parse(tradeOperation.resultJson) as PdaxOrderDetails;
      setTradeSuccess(trade);
      setTradeError(null);
      setTradeInfo(null);
      setTradeOperationId(null);
      tradeIdempotencyKey.current = null;
      if (trade.total_amount) {
        setWithdrawAmount(trade.total_amount.toString());
        setSimAmount(trade.total_amount.toString());
      }
      void refreshBalances();
    } else if (tradeOperation.state === "failed" || tradeOperation.state === "dead_letter") {
      setTradeError(
        `Trade outcome requires recovery (operation ${tradeOperation._id}). Do not retry with a new idempotency key.`,
      );
      setTradeInfo(null);
    }
  }, [tradeOperation, refreshBalances]);

  useEffect(() => {
    if (!withdrawOperation) return;
    if (withdrawOperation.resultJson) {
      const withdrawal = JSON.parse(withdrawOperation.resultJson) as PdaxFiatWithdrawData;
      setWithdrawSuccess(withdrawal);
      setSimIdentifier(withdrawal.identifier);
    }
    if (withdrawOperation.state === "succeeded") {
      setWithdrawError(null);
      setWithdrawInfo(null);
      setWithdrawOperationId(null);
      withdrawIdempotencyKey.current = null;
      void refreshBalances();
    } else if (withdrawOperation.state === "failed" || withdrawOperation.state === "dead_letter") {
      setWithdrawError(
        `Payout outcome requires recovery (operation ${withdrawOperation._id}). Do not retry with a new idempotency key.`,
      );
      setWithdrawInfo(null);
    }
  }, [withdrawOperation, refreshBalances]);

  // Quote Expiry Timer
  useEffect(() => {
    if (!activeQuote || !quoteExpiresAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((quoteExpiresAt - Date.now()) / 1000));
      setQuoteSecondsLeft(remaining);

      if (remaining === 0) {
        setActiveQuote(null);
        setQuoteExpiresAt(null);
        setQuoteError("Quote has expired. Request a new one.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [activeQuote, quoteExpiresAt]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    toast.loading("Connecting to PDAX Provider UAT...", { id: "pdax-connect" });
    try {
      await connectAction({ projectId: typedProjectId });
      // Register the server-owned, versioned PDAX callback URL.
      try {
        const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
        if (!isLocalhost) {
          await registerWebhookAction({ projectId: typedProjectId });
        } else {
          console.log("Localhost detected. Skipping PDAX webhook registration.");
        }
      } catch (pdaxErr) {
        console.error("Auto-registering PDAX webhook failed on connect:", pdaxErr);
      }
      toast.success("Connected to PDAX UAT sandbox!", { id: "pdax-connect" });
      await refreshBalances();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setConnectError(msg);
      toast.error(`Connection failed: ${msg}`, { id: "pdax-connect" });
    } finally {
      setConnecting(false);
    }
  };

  const handleGetQuote = async () => {
    setQuoteLoading(true);
    setQuoteError(null);
    setActiveQuote(null);
    setTradeSuccess(null);
    setTradeError(null);
    setTradeInfo(null);

    const qty = parseFloat(quoteQuantity);
    if (isNaN(qty) || qty <= 0) {
      setQuoteError("Please enter a valid quantity");
      setQuoteLoading(false);
      return;
    }

    toast.loading("Fetching firm quote from PDAX...", { id: "pdax-quote" });
    try {
      const side = fromAsset === "PHP" ? "buy" : "sell";
      const quoteCurrencyParam = fromAsset !== "PHP" ? fromAsset : toAsset;
      const currencyParam = fromAsset;

      const res = (await getQuoteAction({
        projectId: typedProjectId,
        side,
        quoteCurrency: quoteCurrencyParam,
        baseCurrency: "PHP",
        currency: currencyParam,
        quantity: qty,
        firm: true,
        idempotencyId: `q-idemp-${Date.now()}`,
      })) as { quote: PdaxFirmQuote; transactionId: string };

      if (res && res.quote) {
        setActiveQuote(res.quote);
        const exp = Date.parse(res.quote.expires_at);
        setQuoteExpiresAt(exp);
        setQuoteSecondsLeft(Math.max(0, Math.ceil((exp - Date.now()) / 1000)));
        toast.success("Firm quote received! Valid for 15s.", { id: "pdax-quote" });
      } else {
        throw new Error("Invalid quote response");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch firm quote";
      setQuoteError(msg);
      toast.error(`Quote failed: ${msg}`, { id: "pdax-quote" });
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleExecuteTrade = async () => {
    if (!activeQuote) return;
    setTradeLoading(true);
    setTradeError(null);
    setTradeInfo(null);
    setTradeSuccess(null);
    toast.loading("Executing conversion trade...", { id: "pdax-trade" });

    try {
      tradeIdempotencyKey.current ??= `trade-${crypto.randomUUID()}`;
      const result = (await executeTradeAction({
        projectId: typedProjectId,
        quoteId: activeQuote.quote_id,
        idempotencyId: tradeIdempotencyKey.current,
      })) as SettlementOperationResult<PdaxOrderDetails>;

      if (result.state === "succeeded") {
        setTradeSuccess(result.data);
        tradeIdempotencyKey.current = null;
        if (result.data.total_amount) {
          setWithdrawAmount(result.data.total_amount.toString());
          setSimAmount(result.data.total_amount.toString());
        }
        setActiveQuote(null);
        setQuoteExpiresAt(null);
        toast.success("Trade executed successfully!", { id: "pdax-trade" });
        await refreshBalances();
      } else {
        setTradeOperationId(result.operationId);
        const message =
          result.state === "recovery_required"
            ? `Trade outcome requires recovery (operation ${result.operationId}). Do not submit a new trade.`
            : `Trade submitted safely and is awaiting provider confirmation (operation ${result.operationId}).`;
        if (result.state === "recovery_required") {
          setTradeError(message);
        } else {
          setTradeInfo(message);
        }
        toast.warning(message, { id: "pdax-trade" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute trade";
      setTradeError(msg);
      tradeIdempotencyKey.current = null;
      toast.error(`Trade failed: ${msg}`, { id: "pdax-trade" });
    } finally {
      setTradeLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawLoading(true);
    setWithdrawError(null);
    setWithdrawInfo(null);
    setWithdrawSuccess(null);

    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError("Please enter a valid amount");
      setWithdrawLoading(false);
      return;
    }

    withdrawIdempotencyKey.current ??= `withdrawal-${crypto.randomUUID()}`;
    const idempotencyId = withdrawIdempotencyKey.current;
    toast.loading("Initiating bank payout via InstaPay...", { id: "pdax-withdraw" });

    try {
      const result = (await fiatWithdrawAction({
        projectId: typedProjectId,
        idempotencyId,
        amount: amt,
        bankCode: withdrawBank,
        accountName: withdrawAccountName,
        accountNumber: withdrawAccountNumber,
        beneficiaryFirstName: withdrawFirstName,
        beneficiaryLastName: withdrawLastName,
      })) as SettlementOperationResult<PdaxFiatWithdrawData>;

      if (result.state === "succeeded") {
        setWithdrawSuccess(result.data);
        setSimIdentifier(result.data.identifier || idempotencyId);
        withdrawIdempotencyKey.current = null;
        toast.success("InstaPay payout initiated successfully!", { id: "pdax-withdraw" });
        await refreshBalances();
      } else {
        setWithdrawOperationId(result.operationId);
        const message =
          result.state === "recovery_required"
            ? `Payout outcome requires recovery (operation ${result.operationId}). Do not create a new payout.`
            : `Payout accepted and awaiting provider confirmation (operation ${result.operationId}).`;
        if (result.state === "recovery_required") {
          setWithdrawError(message);
        } else {
          setWithdrawInfo(message);
        }
        toast.warning(message, { id: "pdax-withdraw" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate withdrawal";
      setWithdrawError(msg);
      withdrawIdempotencyKey.current = null;
      toast.error(`Payout failed: ${msg}`, { id: "pdax-withdraw" });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleMockWebhook = async () => {
    if (!simIdentifier) {
      setSimError("Please enter a transaction identifier");
      return;
    }
    setSimLoading(true);
    setSimError(null);
    setSimSuccess(false);
    toast.loading("Simulating callback webhook...", { id: "pdax-sim" });

    try {
      await mockWebhookAction({
        projectId: typedProjectId,
        identifier: simIdentifier,
        transactionType: "WITHDRAWAL",
        status: simStatus,
        amount: parseFloat(simAmount),
        fee: parseFloat(simFee),
      });

      setSimSuccess(true);
      toast.success("Callback webhook simulation complete!", { id: "pdax-sim" });
      await refreshBalances();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Simulation failed";
      setSimError(msg);
      toast.error(`Simulation failed: ${msg}`, { id: "pdax-sim" });
    } finally {
      setSimLoading(false);
    }
  };

  if (project === undefined || connection === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCwIcon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConnected = connection && connection.status === "connected";

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Settlement Layer</h1>
          <Badge variant={isConnected ? "success" : "gray"} className="text-sm font-medium">
            {isConnected ? "Connected to PDAX UAT" : "Disconnected"}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Convert regional stablecoins to local currency and pay out directly to local banks via
          PDAX rails.
        </p>
      </div>

      {/* UAT Warnings Alert */}
      <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500">
        <AlertTriangleIcon className="h-4 w-4" />
        <AlertTitle className="font-semibold">UAT Sandbox Environment</AlertTitle>
        <AlertDescription>
          This settlement integration is connected to the PDAX UAT sandbox. All pricing, liquidity,
          balances, and payouts are simulated. Do not deposit real production assets.
        </AlertDescription>
      </Alert>

      {/* Hackathon Demo Guide & Fallback Manual Card */}
      <Card className="border border-zinc-200 dark:border-zinc-800 shadow-sm bg-card/40 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setShowDemoGuide(!showDemoGuide)}
          className="w-full flex items-center justify-between p-5 text-left font-medium hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors rounded-t-xl"
        >
          <div className="flex items-center gap-2.5">
            <BookOpenIcon className="size-5 text-primary" />
            <div>
              <span className="text-base font-semibold block text-zinc-900 dark:text-zinc-100">
                Stellar Hackathon Demo Guide & Fallback Manual
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                Follow this checklist for a live presentation, or use the fallback instructions if
                PDAX UAT is offline.
              </span>
            </div>
          </div>
          {showDemoGuide ? (
            <ChevronUpIcon className="size-5 text-zinc-400" />
          ) : (
            <ChevronDownIcon className="size-5 text-zinc-400" />
          )}
        </button>

        {showDemoGuide && (
          <CardContent className="p-5 pt-0 border-t border-zinc-100 dark:border-zinc-800/60 mt-4 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Step-by-Step Demo Checklist */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                1. End-to-End Demo Checklist
              </h3>
              <ul className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
                <li className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-zinc-300 text-primary focus:ring-primary"
                    readOnly
                    checked={!!isConnected}
                    aria-label="Establish Connection"
                  />
                  <span>
                    <strong>Establish Connection</strong>: Click{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">
                      Connect PDAX Provider
                    </code>{" "}
                    to establish session token caching and register webhook callbacks using global
                    hackathon credentials.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-zinc-300 text-primary focus:ring-primary"
                    aria-label="Fund Stellar Wallet"
                  />
                  <span>
                    <strong>Fund Stellar Wallet</strong>: Ensure your testnet wallet has sufficient
                    simulated{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">
                      USDC
                    </code>{" "}
                    (SEP-41 classic bridge asset on Testnet) to convert.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-zinc-300 text-primary focus:ring-primary"
                    aria-label="Request & Execute Conversion Quote"
                  />
                  <span>
                    <strong>Request & Execute Conversion Quote</strong>: Submit a conversion
                    quantity (e.g. 10 USDC) from{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">
                      USDCXLM
                    </code>{" "}
                    to{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">
                      PHP
                    </code>
                    . Review rates and click{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">
                      Execute Conversion Trade
                    </code>{" "}
                    within the 15-second expiry.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-zinc-300 text-primary focus:ring-primary"
                    aria-label="Initiate bank payout"
                  />
                  <span>
                    <strong>Initiate bank payout</strong>: Select a test destination bank (e.g.{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">
                      Security Bank
                    </code>{" "}
                    or{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">
                      CTBC
                    </code>
                    ) and trigger an InstaPay UAT cashout/withdrawal.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-zinc-300 text-primary focus:ring-primary"
                    aria-label="Verify Lifecycle & Webhooks"
                  />
                  <span>
                    <strong>Verify Lifecycle & Webhooks</strong>: Monitor status transitions on the
                    dashboard history. Open Webhooks log to inspect signed outbound callbacks
                    dispatched by Velo.
                  </span>
                </li>
              </ul>
            </div>

            {/* Offline Fallback Guide */}
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-semibold text-sm">
                <AlertTriangleIcon className="size-4 shrink-0" />
                <span>PDAX UAT Sandbox Offline Fallback Manual</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                If the live PDAX UAT API is down, offline, or returns error responses, you can
                manually simulate the entire settlement workflow to the audience using local mocks:
              </p>
              <ol className="list-decimal pl-4.5 text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5 leading-relaxed">
                <li>
                  Use a pre-seeded project connection (or click connect and let the system cache
                  mock credentials).
                </li>
                <li>
                  Copy a recent transaction reference ID (or generate a mock ID like{" "}
                  <code className="bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.2 rounded text-[10px] font-mono">
                    w-idemp-mock123
                  </code>
                  ).
                </li>
                <li>
                  Fill the **PDAX Webhook Simulator** form below with your reference ID, set status
                  to <code className="font-semibold text-emerald-600">COMPLETED</code>, and click
                  **Trigger Callback Webhook**.
                </li>
                <li>
                  This simulates the incoming PDAX callback locally, bypassing the live network. It
                  updates the database record to{" "}
                  <code className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 px-1 rounded text-[10px]">
                    PAYOUT_SUCCEEDED
                  </code>
                  , dispatches the outbound merchant webhook, and registers it in the webhook logs,
                  perfectly demonstrating the integrated flow.
                </li>
              </ol>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Roster / Status Panel */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Connection status card */}
        <Card className="md:col-span-1 shadow-sm border bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <ArrowLeftRightIcon className="size-4 text-primary" />
              Settlement Provider
            </CardTitle>
            <CardDescription>Integrate regional settlement brokers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm text-muted-foreground">Active Broker</span>
              <span className="font-medium">PDAX</span>
            </div>
            {isConnected ? (
              <>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">Sandbox User</span>
                  <span className="text-xs font-mono">
                    {connection.username || "UAT Institution"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Synced</span>
                  <span className="text-xs text-muted-foreground">
                    {connection.updatedAt
                      ? new Date(connection.updatedAt).toLocaleTimeString()
                      : "Just now"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Connect your Velo project to the PDAX sandbox using the APAC hackathon institutional
                credentials.
              </p>
            )}
          </CardContent>
          <CardFooter className="pt-2">
            {!isConnected ? (
              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full flex items-center justify-center gap-2"
              >
                {connecting ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : null}
                Connect PDAX Provider
              </Button>
            ) : (
              <Button variant="outline" className="w-full" disabled>
                Active
              </Button>
            )}
            {connectError && (
              <Alert variant="destructive" className="mt-4">
                <XCircleIcon className="h-4 w-4" />
                <AlertTitle>Connection Failed</AlertTitle>
                <AlertDescription className="text-xs">{connectError}</AlertDescription>
              </Alert>
            )}
          </CardFooter>
        </Card>

        {/* Balances Grid Card */}
        <Card className="md:col-span-2 shadow-sm border bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <CoinsIcon className="size-4 text-primary" />
                PDAX Sandbox Balances
              </CardTitle>
              <CardDescription>
                Available balances inside the institutional settlement wallet.
              </CardDescription>
            </div>
            {isConnected && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => refreshBalances(true)}
                disabled={balancesLoading}
                className="size-8"
              >
                <RefreshCwIcon className={`size-3.5 ${balancesLoading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!isConnected ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground border-2 border-dashed rounded-lg p-4 bg-muted/20">
                <InfoIcon className="size-6 mb-2 text-zinc-400" />
                <p className="text-sm">Connect provider to display sandbox assets.</p>
              </div>
            ) : balancesLoading && !balances ? (
              <div className="space-y-2">
                <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
                <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
                <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
              </div>
            ) : balancesError ? (
              <Alert variant="destructive">
                <XCircleIcon className="h-4 w-4" />
                <AlertTitle>Balances Fetch Failed</AlertTitle>
                <AlertDescription className="text-xs">{balancesError}</AlertDescription>
              </Alert>
            ) : balances && balances.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 relative max-w-[240px]">
                  <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search assets by ticker..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs bg-muted/30 focus-visible:bg-background transition-colors"
                  />
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 [&_[data-slot=table-container]]:max-h-[280px] [&_[data-slot=table-container]]:overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead
                          className="sticky top-0 bg-card z-10 font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer select-none group py-2"
                          onClick={() => handleSort("currency")}
                        >
                          <div className="flex items-center gap-1">
                            <span>Ticker</span>
                            <ArrowUpDownIcon
                              className={`size-3 transition-opacity ${sortField === "currency" ? "opacity-100 text-primary" : "opacity-40 group-hover:opacity-85"}`}
                            />
                          </div>
                        </TableHead>
                        <TableHead className="sticky top-0 bg-card z-10 font-semibold text-zinc-900 dark:text-zinc-100">
                          Type
                        </TableHead>
                        <TableHead
                          className="sticky top-0 bg-card z-10 font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer select-none group py-2 text-right"
                          onClick={() => handleSort("available")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Available</span>
                            <ArrowUpDownIcon
                              className={`size-3 transition-opacity ${sortField === "available" ? "opacity-100 text-primary" : "opacity-40 group-hover:opacity-85"}`}
                            />
                          </div>
                        </TableHead>
                        <TableHead
                          className="sticky top-0 bg-card z-10 font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer select-none group py-2 text-right"
                          onClick={() => handleSort("hold")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>On Hold</span>
                            <ArrowUpDownIcon
                              className={`size-3 transition-opacity ${sortField === "hold" ? "opacity-100 text-primary" : "opacity-40 group-hover:opacity-85"}`}
                            />
                          </div>
                        </TableHead>
                        <TableHead
                          className="sticky top-0 bg-card z-10 font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer select-none group py-2 text-right"
                          onClick={() => handleSort("total")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Total</span>
                            <ArrowUpDownIcon
                              className={`size-3 transition-opacity ${sortField === "total" ? "opacity-100 text-primary" : "opacity-40 group-hover:opacity-85"}`}
                            />
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedBalances.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-6 text-center text-xs text-muted-foreground"
                          >
                            No matching assets found for &ldquo;{searchQuery}&rdquo;
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAndSortedBalances.map((item) => (
                          <TableRow
                            key={item.currency}
                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors"
                          >
                            <TableCell className="font-bold text-sm tracking-wide text-zinc-900 dark:text-zinc-100">
                              {item.currency}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={item.asset_type === "FIAT" ? "info" : "success"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {item.asset_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {parseFloat(item.available).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {parseFloat(item.hold).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {parseFloat(item.total).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No supported assets found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Execution Workflow and Webhook Simulator */}
      {isConnected && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Quote & Trade Execution Panel */}
          <div className="space-y-6">
            <Card className="shadow-sm border bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <ArrowLeftRightIcon className="size-4 text-primary" />
                  Step 1: Quote & Trade Conversion
                </CardTitle>
                <CardDescription>Request a firm quote and execute conversion.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <Label
                      htmlFor="quoteQuantity"
                      className="text-xs font-medium text-zinc-500 uppercase"
                    >
                      Quantity
                    </Label>
                    <Input
                      id="quoteQuantity"
                      type="number"
                      value={quoteQuantity}
                      onChange={(e) => setQuoteQuantity(e.target.value)}
                      placeholder="Amount"
                      className="border-zinc-200"
                    />
                  </div>
                  <div>
                    <SearchableSelect
                      value={fromAsset}
                      onValueChange={(val) => {
                        setFromAsset(val);
                        setActiveQuote(null);
                      }}
                      options={availableAssets}
                      placeholder="Select From"
                      label="From Asset"
                    />
                  </div>
                  <div>
                    <SearchableSelect
                      value={toAsset}
                      onValueChange={(val) => {
                        setToAsset(val);
                        setActiveQuote(null);
                      }}
                      options={availableAssets}
                      placeholder="Select To"
                      label="To Asset"
                    />
                  </div>
                </div>

                {isDirectCryptoToCrypto && (
                  <Alert className="py-2 px-3 border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500 animate-in fade-in duration-200">
                    <AlertDescription className="text-xs flex items-center gap-1.5 font-medium">
                      <AlertTriangleIcon className="size-4 shrink-0 text-amber-500" />
                      Direct token-to-token swap is not supported by PDAX. Swap via PHP instead.
                    </AlertDescription>
                  </Alert>
                )}

                {isSameAsset && (
                  <Alert className="py-2 px-3 border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500 animate-in fade-in duration-200">
                    <AlertDescription className="text-xs flex items-center gap-1.5 font-medium">
                      <AlertTriangleIcon className="size-4 shrink-0 text-amber-500" />
                      Source and destination assets must be different.
                    </AlertDescription>
                  </Alert>
                )}

                {quoteError && (
                  <Alert variant="destructive">
                    <XCircleIcon className="h-4 w-4" />
                    <AlertTitle>Quote Request Failed</AlertTitle>
                    <AlertDescription className="text-xs">{quoteError}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleGetQuote}
                  disabled={isQuoteDisabled}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {quoteLoading ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : null}
                  Get Firm Quote
                </Button>

                {/* Display Executable Quote */}
                {activeQuote && (
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                      <span className="text-sm font-semibold text-primary">
                        Firm Quote Received
                      </span>
                      <span className="text-xs flex items-center gap-1 font-mono text-zinc-500">
                        <ClockIcon className="size-3 text-amber-500 animate-pulse" />
                        Expires in {quoteSecondsLeft}s
                      </span>
                    </div>

                    {/* Progress countdown bar */}
                    <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${(quoteSecondsLeft / 15) * 100}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                      <span className="text-muted-foreground">Sell Quantity:</span>
                      <span className="font-semibold text-right">
                        {activeQuote.side === "sell"
                          ? `${activeQuote.base_quantity} ${activeQuote.quote_currency}`
                          : `₱${activeQuote.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} PHP`}
                      </span>
                      <span className="text-muted-foreground">UAT Rate:</span>
                      <span className="font-semibold text-right">₱{activeQuote.price} PHP</span>
                      <span className="text-muted-foreground">
                        {activeQuote.side === "sell" ? "Estimated Payout:" : "Estimated Receive:"}
                      </span>
                      <span className="font-bold text-primary text-right">
                        {activeQuote.side === "sell"
                          ? `₱${activeQuote.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} PHP`
                          : `${activeQuote.base_quantity} ${activeQuote.quote_currency}`}
                      </span>
                    </div>

                    {tradeError && (
                      <Alert variant="destructive">
                        <XCircleIcon className="h-4 w-4" />
                        <AlertTitle>Execution Failed</AlertTitle>
                        <AlertDescription className="text-xs">{tradeError}</AlertDescription>
                      </Alert>
                    )}

                    {tradeInfo && !tradeSuccess && (
                      <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500 animate-in zoom-in-95 duration-200">
                        <RefreshCwIcon className="h-4 w-4 animate-spin text-amber-500" />
                        <AlertTitle className="font-semibold text-amber-700 dark:text-amber-400">
                          Execution Pending
                        </AlertTitle>
                        <AlertDescription className="text-xs">{tradeInfo}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      onClick={handleExecuteTrade}
                      disabled={tradeLoading}
                      className="w-full flex items-center justify-center gap-2 mt-2"
                    >
                      {tradeLoading ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : null}
                      Execute Conversion Trade
                    </Button>
                  </div>
                )}

                {/* Trade execution confirmation */}
                {tradeSuccess && (
                  <Alert className="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-500 animate-in zoom-in-95 duration-200">
                    <CheckCircle2Icon className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Trade Executed</AlertTitle>
                    <AlertDescription className="text-xs space-y-1">
                      <div>Conversion executed successfully on PDAX UAT rails.</div>
                      <div className="font-mono mt-1">Order ID: {tradeSuccess.order_id}</div>
                      <div className="font-mono">
                        {tradeSuccess.side === "sell"
                          ? `Sold: ${tradeSuccess.base_quantity} ${tradeSuccess.quote_currency} ➔ ₱${tradeSuccess.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} PHP`
                          : `Spent: ₱${tradeSuccess.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} PHP ➔ ${tradeSuccess.base_quantity} ${tradeSuccess.quote_currency}`}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* InstaPay Payout Panel */}
          <div className="space-y-6">
            <Card className="shadow-sm border bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <Building2Icon className="size-4 text-primary" />
                  Step 2: Bank Withdrawal via InstaPay
                </CardTitle>
                <CardDescription>Payout PHP to supported sandbox test banks.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="withdrawBank">Test Destination Bank</Label>
                    <Select value={withdrawBank} onValueChange={handleBankChange}>
                      <SelectTrigger id="withdrawBank">
                        <SelectValue placeholder="Destination Bank" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BASECPH">Security Bank (BASECPH)</SelectItem>
                        <SelectItem value="BACTBPH">CTBC Bank (BACTBPH)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="withdrawAmount">Amount (PHP)</Label>
                    <Input
                      id="withdrawAmount"
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="Amount to withdraw"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="withdrawFirstName">Beneficiary First Name</Label>
                    <Input
                      id="withdrawFirstName"
                      value={withdrawFirstName}
                      onChange={(e) => setWithdrawFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="withdrawLastName">Beneficiary Last Name</Label>
                    <Input
                      id="withdrawLastName"
                      value={withdrawLastName}
                      onChange={(e) => setWithdrawLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="withdrawAccountNumber">Bank Account Number</Label>
                  <Input
                    id="withdrawAccountNumber"
                    value={withdrawAccountNumber}
                    onChange={(e) => setWithdrawAccountNumber(e.target.value)}
                  />
                </div>

                {withdrawError && (
                  <Alert variant="destructive">
                    <XCircleIcon className="h-4 w-4" />
                    <AlertTitle>Payout Failed</AlertTitle>
                    <AlertDescription className="text-xs">{withdrawError}</AlertDescription>
                  </Alert>
                )}

                {withdrawInfo && !withdrawSuccess && (
                  <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500 animate-in zoom-in-95 duration-200">
                    <RefreshCwIcon className="h-4 w-4 animate-spin text-amber-500" />
                    <AlertTitle className="font-semibold text-amber-700 dark:text-amber-400">
                      Payout Pending
                    </AlertTitle>
                    <AlertDescription className="text-xs">{withdrawInfo}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleWithdraw}
                  disabled={withdrawLoading}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {withdrawLoading ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : null}
                  Initiate InstaPay Withdrawal
                </Button>

                {withdrawSuccess && (
                  <Alert className="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-500 animate-in zoom-in-95 duration-200">
                    <CheckCircle2Icon className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Payout Pending</AlertTitle>
                    <AlertDescription className="text-xs space-y-1">
                      <div>
                        Withdrawal request initiated successfully. Status is:{" "}
                        {withdrawSuccess.status}.
                      </div>
                      <div className="font-mono mt-1">
                        Transaction Ref: {withdrawSuccess.identifier}
                      </div>
                      <div className="font-mono">
                        Reference Number: {withdrawSuccess.reference_number || "n/a"}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Webhook Simulator (Sandbox testing helper widget) */}
      {isConnected && (
        <Card className="shadow-sm border bg-card/60 backdrop-blur-sm border-dashed">
          <CardHeader className="pb-3 flex flex-row items-center gap-3">
            <SendIcon className="size-5 text-amber-500 animate-pulse" />
            <div>
              <CardTitle className="text-lg font-medium">
                PDAX Webhook Simulator (Sandbox Testing Helper)
              </CardTitle>
              <CardDescription>
                Simulate callback webhooks from PDAX to test instant webhook delivery states in
                Velo.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="simIdentifier">Transaction Ref (Identifier)</Label>
              <Input
                id="simIdentifier"
                placeholder="tx_velo_settlement_..."
                value={simIdentifier}
                onChange={(e) => setSimIdentifier(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="simStatus">Status to Trigger</Label>
              <Select value={simStatus} onValueChange={setSimStatus}>
                <SelectTrigger id="simStatus">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">COMPLETED (Payout Success)</SelectItem>
                  <SelectItem value="FAILED">FAILED (Payout Failed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="simAmount">Amount (PHP)</Label>
              <Input
                id="simAmount"
                type="number"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Button
                onClick={handleMockWebhook}
                disabled={simLoading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center gap-2"
              >
                {simLoading ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : null}
                Trigger Callback Webhook
              </Button>
            </div>
          </CardContent>
          <CardFooter className="pt-0 flex flex-col items-start gap-1">
            {simSuccess && (
              <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2Icon className="size-3" /> Callback Webhook processed successfully.
                Outbound webhooks sent to merchant!
              </p>
            )}
            {simError && (
              <Alert variant="destructive" className="w-full mt-2">
                <XCircleIcon className="h-4 w-4" />
                <AlertTitle>Simulation Failed</AlertTitle>
                <AlertDescription className="text-xs">{simError}</AlertDescription>
              </Alert>
            )}
          </CardFooter>
        </Card>
      )}

      {/* History and Delivery Logs */}
      {isConnected && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Action History */}
          <Card className="shadow-sm border bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <HistoryIcon className="size-4 text-primary" />
                  Settlement History
                </CardTitle>
                <CardDescription>Lifecycle updates from the database.</CardDescription>
              </div>
              {transactions && transactions.some((tx) => tx.status === "PAYOUT_PENDING") && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={refreshAllLoading}
                  onClick={async () => {
                    setRefreshAllLoading(true);
                    toast.loading("Checking pending payout statuses...", { id: "pdax-pending" });
                    try {
                      const res = (await checkPayoutStatusAction({
                        projectId: typedProjectId,
                      })) as { updated: number; total: number };
                      toast.success(
                        `Check complete. Updated ${res?.updated || 0} of ${res?.total || 0} pending payouts.`,
                        { id: "pdax-pending" },
                      );
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : "Failed to check statuses";
                      toast.error(`Check failed: ${msg}`, { id: "pdax-pending" });
                    } finally {
                      setRefreshAllLoading(false);
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <RefreshCwIcon className={`size-3 ${refreshAllLoading ? "animate-spin" : ""}`} />
                  Refresh All Pending
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-2">
              {transactions && transactions.length > 0 ? (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <Table className="min-w-full">
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-xs py-2">Date/Time</TableHead>
                        <TableHead className="text-xs py-2">Idempotency ID</TableHead>
                        <TableHead className="text-xs py-2">Status</TableHead>
                        <TableHead className="text-xs py-2">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx._id} className="hover:bg-muted/10">
                          <TableCell className="text-xs py-2">
                            {new Date(tx.createdAt).toLocaleTimeString()}
                          </TableCell>
                          <TableCell
                            className="text-xs py-2 font-mono max-w-[120px] truncate"
                            title={tx.idempotencyId}
                          >
                            {tx.idempotencyId}
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={
                                  tx.status === "PAYOUT_SUCCEEDED"
                                    ? "success"
                                    : tx.status === "PAYOUT_FAILED"
                                      ? "error"
                                      : tx.status === "PAYOUT_PENDING"
                                        ? "warning"
                                        : "info"
                                }
                                className="text-[10px]"
                              >
                                {tx.status}
                              </Badge>
                              {tx.status === "PAYOUT_PENDING" && (
                                <button
                                  type="button"
                                  disabled={refreshingPayoutId === tx.idempotencyId}
                                  onClick={async () => {
                                    setRefreshingPayoutId(tx.idempotencyId);
                                    toast.loading(
                                      `Polling status for payout ${tx.idempotencyId.slice(0, 8)}...`,
                                      { id: `pdax-poll-${tx.idempotencyId}` },
                                    );
                                    try {
                                      await checkPayoutStatusAction({
                                        projectId: typedProjectId,
                                        idempotencyId: tx.idempotencyId,
                                      });
                                      toast.success("Payout status updated!", {
                                        id: `pdax-poll-${tx.idempotencyId}`,
                                      });
                                    } catch (err: unknown) {
                                      const msg =
                                        err instanceof Error
                                          ? err.message
                                          : "Failed to check status";
                                      toast.error(`Check failed: ${msg}`, {
                                        id: `pdax-poll-${tx.idempotencyId}`,
                                      });
                                    } finally {
                                      setRefreshingPayoutId(null);
                                    }
                                  }}
                                  className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                                  title="Check payout status on PDAX"
                                >
                                  <RefreshCwIcon
                                    className={`size-3 text-amber-500 ${refreshingPayoutId === tx.idempotencyId ? "animate-spin" : ""}`}
                                  />
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            {tx.tradeDetails && (
                              <span className="text-[10px]">
                                Quote Executed: Sell {tx.tradeDetails.quantity} USDC @{" "}
                                {tx.tradeDetails.price} (Order: {tx.tradeDetails.orderId})
                              </span>
                            )}
                            {tx.withdrawalDetails && (
                              <span className="text-[10px] text-muted-foreground block">
                                Payout: ₱{tx.withdrawalDetails.amount} to{" "}
                                {tx.withdrawalDetails.bankCode} (Ref:{" "}
                                {tx.withdrawalDetails.referenceNumber || "PENDING"})
                              </span>
                            )}
                            {!tx.tradeDetails && !tx.withdrawalDetails && tx.quoteId && (
                              <span className="text-[10px] text-muted-foreground">
                                Firm Quote Locked (ID: {tx.quoteId})
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No settlement transactions found. Initiate a quote or payout sequence above.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook Delivery Logs */}
          <Card className="shadow-sm border bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <ActivityIcon className="size-4 text-primary" />
                Velo Outbound Webhook Delivery Logs
              </CardTitle>
              <CardDescription>Signed webhooks delivered to the merchant endpoint.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {webhookDeliveries && webhookDeliveries.length > 0 ? (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <Table className="min-w-full">
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-xs py-2">Time</TableHead>
                        <TableHead className="text-xs py-2">Event</TableHead>
                        <TableHead className="text-xs py-2">HTTP Status</TableHead>
                        <TableHead className="text-xs py-2">Latency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhookDeliveries.map((delivery) => (
                        <TableRow key={delivery._id} className="hover:bg-muted/10">
                          <TableCell className="text-xs py-2">
                            {new Date(delivery.createdAt).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="text-xs py-2 font-mono text-[10px]">
                            {delivery.eventType}
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            <Badge
                              variant={delivery.status === "success" ? "success" : "error"}
                              className="text-[10px]"
                            >
                              {delivery.httpStatus
                                ? `${delivery.httpStatus} ${delivery.status.toUpperCase()}`
                                : delivery.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2 font-mono text-[10px]">
                            {delivery.responseTimeMs ? `${delivery.responseTimeMs}ms` : "n/a"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No outbound webhook deliveries logged yet. Complete actions to trigger callbacks.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
