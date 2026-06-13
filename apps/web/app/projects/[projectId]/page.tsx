import { PlaceholderPage } from "@/features/readiness/placeholder-page";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return (
    <PlaceholderPage
      title={`Project ${projectId}`}
      description="Sprint 3 will turn this into the project control center with registry proof, contract previews, event previews, and webhook health."
      primaryAction={{ href: `/projects/${projectId}/contracts`, label: "Contracts" }}
      secondaryAction={{ href: `/projects/${projectId}/events`, label: "Events" }}
      checklist={["Registry proof", "Official contracts", "Recent activity", "Webhook health"]}
    />
  );
}
