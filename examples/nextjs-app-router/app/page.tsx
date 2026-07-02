"use client";

import { useState } from "react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: "600px",
      margin: "80px auto",
      padding: "40px 24px",
      borderRadius: "16px",
      background: "#18181b",
      border: "1px solid #27272a",
      boxShadow: "0 4px 30px rgba(0, 0, 0, 0.4)"
    }}>
      <h1 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "8px" }}>
        Velo Checkout Integration
      </h1>
      <p style={{ color: "#a1a1aa", fontSize: "14px", marginBottom: "24px" }}>
        Next.js App Router & `@carts1024/velo-sdk` demo store.
      </p>

      <div style={{
        padding: "16px",
        borderRadius: "8px",
        background: "#09090b",
        border: "1px solid #27272a",
        marginBottom: "24px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span>Order #1001</span>
          <strong>10.00 USDC</strong>
        </div>
        <span style={{ fontSize: "12px", color: "#71717a" }}>1x Velo Pro Subscription</span>
      </div>

      {error && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "6px",
          background: "#450a0a",
          border: "1px solid #7f1d1d",
          color: "#fca5a5",
          fontSize: "14px",
          marginBottom: "24px"
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: "8px",
          background: "#ffffff",
          color: "#09090b",
          border: "none",
          fontWeight: "600",
          fontSize: "15px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
          transition: "all 0.2s"
        }}
      >
        {loading ? "Redirecting to Velo Pay..." : "Pay with USDC"}
      </button>
    </div>
  );
}
