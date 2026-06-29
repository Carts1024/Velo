import { AppShell } from "@/core/app-shell";
import { ProjectIntegration } from "@/features/projects/project-integration";

type ProjectIntegrationPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectIntegrationPage({ params }: ProjectIntegrationPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectIntegration projectId={projectId} />
    </AppShell>
  );
}
