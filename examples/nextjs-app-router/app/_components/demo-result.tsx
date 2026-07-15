import Link from "next/link";

import styles from "./demo-result.module.css";

export type DemoOutcome = "success" | "failed" | "cancel";

type OutcomeContent = {
  badge: string;
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  action: string;
};

const outcomes: Record<DemoOutcome, OutcomeContent> = {
  success: {
    badge: "Completed",
    code: "CHECKOUT.COMPLETE",
    eyebrow: "Demo checkout complete",
    title: "Payment successful",
    description: "Your demo payment was confirmed and the checkout flow finished successfully.",
    note: "You can safely return to the demo and create another test payment.",
    action: "Back to demo",
  },
  failed: {
    badge: "Not completed",
    code: "CHECKOUT.FAILED",
    eyebrow: "Demo checkout update",
    title: "Payment didn’t go through",
    description: "We couldn’t complete this demo payment. Nothing has been finalized.",
    note: "Return to the demo to review your selection and try the checkout again.",
    action: "Try again",
  },
  cancel: {
    badge: "Cancelled",
    code: "CHECKOUT.CANCELLED",
    eyebrow: "Demo checkout update",
    title: "Payment cancelled",
    description: "You left the checkout before completing the demo payment.",
    note: "Nothing was charged. You can restart the checkout whenever you’re ready.",
    action: "Return to checkout",
  },
};

const outcomeClasses = {
  success: styles.success!,
  failed: styles.failed!,
  cancel: styles.cancel!,
} satisfies Record<DemoOutcome, string>;

export function DemoResult({ outcome }: { outcome: DemoOutcome }) {
  const content = outcomes[outcome];

  return (
    <main className={`${styles.page} ${outcomeClasses[outcome]}`}>
      <section className={styles.card} aria-labelledby="result-title">
        <header className={styles.brand}>
          <span className={styles.brandIdentity}>
            <span className={styles.logo} aria-hidden="true">
              V
            </span>
            <span>Velo</span>
          </span>
          <span className={styles.environment}>
            <span aria-hidden="true" />
            Testnet demo
          </span>
        </header>

        <div className={styles.matrixPanel} aria-hidden="true">
          <span className={styles.axisHorizontal} />
          <span className={styles.axisVertical} />
          <div className={styles.statusIcon}>
            <StatusIcon outcome={outcome} />
          </div>
          <span className={styles.statusCode}>{content.code}</span>
        </div>

        <div className={styles.copy}>
          <div className={styles.copyMeta}>
            <p className={styles.eyebrow}>{content.eyebrow}</p>
            <span className={styles.badge}>
              <span className={styles.badgeDot} aria-hidden="true" />
              {content.badge}
            </span>
          </div>
          <h1 id="result-title">{content.title}</h1>
          <p className={styles.description}>{content.description}</p>
        </div>

        <div className={styles.note}>
          <span className={styles.noteMark} aria-hidden="true">
            //
          </span>
          <p>{content.note}</p>
        </div>

        <Link className={styles.action} href="/">
          {content.action}
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path d="M4 10h11m-4-4 4 4-4 4" />
          </svg>
        </Link>

        <footer className={styles.footer}>
          <span>SDK_DEMO</span>
          <span aria-hidden="true">•••</span>
          <span>No real funds moved</span>
        </footer>
      </section>
    </main>
  );
}

function StatusIcon({ outcome }: { outcome: DemoOutcome }) {
  if (outcome === "success") {
    return (
      <svg viewBox="0 0 32 32">
        <path d="m8.5 16.5 5 5 10-11" />
      </svg>
    );
  }

  if (outcome === "failed") {
    return (
      <svg viewBox="0 0 32 32">
        <path d="M16 9.5v8" />
        <path d="M16 22.5h.01" />
        <path d="M14.1 5.8 4.5 23a2.2 2.2 0 0 0 1.9 3.2h19.2a2.2 2.2 0 0 0 1.9-3.2L17.9 5.8a2.2 2.2 0 0 0-3.8 0Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32">
      <path d="M10 10l12 12M22 10 10 22" />
    </svg>
  );
}
