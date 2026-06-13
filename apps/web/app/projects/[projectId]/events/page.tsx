import { PlaceholderPage } from "@/features/readiness/placeholder-page";

type ProjectEventsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectEventsPage({ params }: ProjectEventsPageProps) {
  const { projectId } = await params;

  return (
    <PlaceholderPage
      title="Events"
      description="Sprint 6 will add bounded event polling, event filters, table rows, and raw/decoded event detail sheets."
      primaryAction={{ href: `/projects/${projectId}`, label: "Project overview" }}
      secondaryAction={{ href: `/projects/${projectId}/webhooks`, label: "Webhooks" }}
      checklist={["Event polling", "Event table", "Detail sheet"]}
    />
  );
}
