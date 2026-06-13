import { AppShell } from "@/core/app-shell";
import { CreateProjectForm } from "@/features/projects/create-project-form";

export default function NewProjectPage() {
  return (
    <AppShell>
      <CreateProjectForm />
    </AppShell>
  );
}
