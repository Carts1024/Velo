import { PublicVerification } from "@/features/projects/public-verification";

type VerifyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { slug } = await params;

  return <PublicVerification slug={slug} />;
}
