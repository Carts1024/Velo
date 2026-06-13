import { PlaceholderPage } from "@/features/readiness/placeholder-page";

export default function NewProjectPage() {
  return (
    <PlaceholderPage
      title="Create project"
      description="Sprint 2 will add the draft project form, metadata hash preview, slug generation, and wallet readiness checks."
      primaryAction={{ href: "/dashboard", label: "Back to dashboard" }}
      checklist={["Project metadata", "Generated slug", "Metadata hash"]}
    />
  );
}
