import { DemoResult } from "@/app/_components/demo-result";

export const metadata = {
  title: "Payment cancelled | Velo demo",
  description: "The Velo demo payment was cancelled.",
};

export default function CancelPage() {
  return <DemoResult outcome="cancel" />;
}
