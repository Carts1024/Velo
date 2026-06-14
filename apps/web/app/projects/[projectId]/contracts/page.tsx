import { AppShell } from "@/core/app-shell";
import { ProjectContracts } from "@/features/projects/project-contracts";

type ProjectContractsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectContractsPage({ params }: ProjectContractsPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectContracts projectId={projectId} />
    </AppShell>
  );
}
