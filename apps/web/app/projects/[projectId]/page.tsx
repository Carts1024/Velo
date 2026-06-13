import { AppShell } from "@/core/app-shell";
import { ProjectDetail } from "@/features/projects/project-detail";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectDetail projectId={projectId} />
    </AppShell>
  );
}
