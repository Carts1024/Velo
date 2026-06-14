import { AppShell } from "@/core/app-shell";
import { ProjectWebhooks } from "@/features/projects/project-webhooks";

type ProjectWebhooksPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectWebhooksPage({ params }: ProjectWebhooksPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectWebhooks projectId={projectId} />
    </AppShell>
  );
}
