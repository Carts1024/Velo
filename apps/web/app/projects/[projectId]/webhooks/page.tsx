import { PlaceholderPage } from "@/features/readiness/placeholder-page";

type ProjectWebhooksPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectWebhooksPage({ params }: ProjectWebhooksPageProps) {
  const { projectId } = await params;

  return (
    <PlaceholderPage
      title="Webhooks"
      description="Sprint 7 will add private webhook endpoint settings, event type selection, demo delivery, and delivery logs."
      primaryAction={{ href: `/projects/${projectId}`, label: "Project overview" }}
      checklist={["Endpoint settings", "Test delivery", "Delivery logs"]}
    />
  );
}
