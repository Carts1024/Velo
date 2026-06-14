import { AppShell } from "@/core/app-shell";
import { ProjectEvents } from "@/features/projects/project-events";

type ProjectEventsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectEventsPage({ params }: ProjectEventsPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectEvents projectId={projectId} />
    </AppShell>
  );
}
