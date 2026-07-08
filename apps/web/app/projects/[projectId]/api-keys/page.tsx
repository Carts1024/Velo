import { AppShell } from "@/core/app-shell";
import { ProjectApiKeys } from "@/features/projects/project-api-keys";

type ProjectApiKeysPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectApiKeysPage({ params }: ProjectApiKeysPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectApiKeys projectId={projectId} />
    </AppShell>
  );
}
