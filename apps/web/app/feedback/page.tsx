import { AppShell } from "@/core/app-shell";
import { FeedbackForm } from "@/features/feedback/feedback-form";
import { FeedbackList } from "@/features/feedback/feedback-list";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feedback — TalaKit",
  description: "Share your feedback about TalaKit. Rate your experience and help us improve.",
};

export default function FeedbackPage() {
  return (
    <AppShell>
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Feedback</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Help us improve TalaKit by sharing your experience. Rate and leave your comments below.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1fr]">
          <FeedbackForm />
          <aside className="flex flex-col gap-3">
            <h2 className="text-base font-semibold tracking-normal">Recent feedback</h2>
            <FeedbackList />
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
