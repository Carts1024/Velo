import { DemoResult } from "@/app/_components/demo-result";

export const metadata = {
  title: "Payment successful | Velo demo",
  description: "The Velo demo payment completed successfully.",
};

export default function SuccessPage() {
  return <DemoResult outcome="success" />;
}
