import { AppShell } from "@/core/app-shell";
import { ProjectWallets } from "@/features/projects/project-wallets";

type ProjectWalletsPageProps = { params: Promise<{ projectId: string }> };

export default async function ProjectWalletsPage({ params }: ProjectWalletsPageProps) {
  const { projectId } = await params;
  return (
    <AppShell>
      <ProjectWallets projectId={projectId} />
    </AppShell>
  );
}
