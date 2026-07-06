import { AppShell } from "@/core/app-shell";
import { ProjectSettlement } from "@/features/projects/project-settlement";

type ProjectSettlementPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectSettlementPage({ params }: ProjectSettlementPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectSettlement projectId={projectId} />
    </AppShell>
  );
}
