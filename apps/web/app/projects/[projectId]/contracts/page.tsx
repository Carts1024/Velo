import { PlaceholderPage } from "@/features/readiness/placeholder-page";

type ProjectContractsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectContractsPage({ params }: ProjectContractsPageProps) {
  const { projectId } = await params;

  return (
    <PlaceholderPage
      title="Official contracts"
      description="Sprint 4 will add owner-only contract add/remove flows, contract ID validation, and confirmation states."
      primaryAction={{ href: `/projects/${projectId}`, label: "Project overview" }}
      secondaryAction={{ href: `/verify/${projectId}`, label: "Public page" }}
      checklist={["Add contract", "Remove contract", "Contract table"]}
    />
  );
}
