type ProjectReadinessInput = {
  status: "draft" | "pending_registration" | "registered" | "registration_error" | "stale";
  registrationTxHash?: string;
  registryProjectId?: number;
  slug: string;
};

export type DemoReadinessItem = {
  id: "project" | "register" | "contract" | "activity" | "public-proof" | "webhook";
  label: string;
  description: string;
  complete: boolean;
  href?: string;
};

export function getDemoReadiness({
  project,
  activeContractCount,
  eventCount,
  webhookConfigured,
  deliveryCount,
}: {
  project: ProjectReadinessInput;
  activeContractCount: number;
  eventCount: number;
  webhookConfigured: boolean;
  deliveryCount: number;
}) {
  const registered =
    project.status === "registered" &&
    project.registryProjectId !== undefined &&
    Boolean(project.registrationTxHash);
  const items: DemoReadinessItem[] = [
    {
      id: "project",
      label: "Create DemoPay",
      description: "Project metadata is saved in TalaKit.",
      complete: true,
    },
    {
      id: "register",
      label: "Register on-chain",
      description: "The registry transaction is confirmed and synced.",
      complete: registered,
    },
    {
      id: "contract",
      label: "Link an official contract",
      description: "At least one contract is active for this project.",
      complete: activeContractCount > 0,
      href: "contracts",
    },
    {
      id: "activity",
      label: "Observe contract activity",
      description: "At least one recent event is cached.",
      complete: eventCount > 0,
      href: "events",
    },
    {
      id: "public-proof",
      label: "Share public proof",
      description: "The wallet-free verification page is ready.",
      complete: registered,
      href: `/verify/${project.slug}`,
    },
    {
      id: "webhook",
      label: "Record webhook delivery",
      description: webhookConfigured
        ? "Send one demo delivery and verify its log."
        : "Configure the private demo endpoint, then send a test event.",
      complete: deliveryCount > 0,
      href: "webhooks",
    },
  ];
  const completedCount = items.filter((item) => item.complete).length;

  return {
    items,
    completedCount,
    totalCount: items.length,
    percent: Math.round((completedCount / items.length) * 100),
  };
}
