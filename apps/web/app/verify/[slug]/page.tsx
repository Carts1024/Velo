import { AppShell } from "@/core/app-shell";
import { PublicVerification } from "@/features/projects/public-verification";

type VerifyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { slug } = await params;

  return (
    <AppShell>
      <PublicVerification slug={slug} />
    </AppShell>
  );
}
