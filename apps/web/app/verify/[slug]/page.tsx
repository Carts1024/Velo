import { PlaceholderPage } from "@/features/readiness/placeholder-page";

type VerifyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { slug } = await params;

  return (
    <PlaceholderPage
      title={`Verify ${slug}`}
      description="Sprint 4 will turn this into the public proof page with registry status, owner wallet, metadata hash, and official contract IDs."
      primaryAction={{ href: "/debug", label: "Debug transaction" }}
      checklist={["Public-safe query", "Registry proof", "Official contracts"]}
    />
  );
}
