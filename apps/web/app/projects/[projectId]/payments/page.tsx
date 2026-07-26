import { AppShell } from "@/core/app-shell";
import { ProjectPayments } from "@/features/projects/project-payments";

type ProjectPaymentsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPaymentsPage({ params }: ProjectPaymentsPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectPayments projectId={projectId} />
    </AppShell>
  );
}
