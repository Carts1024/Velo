"use client";

import { AppShell } from "@/core/app-shell";
import { useWallet } from "@/core/wallet/wallet-provider";
import { useUserProfile } from "@/features/onboarding/use-user-profile";
import { ProfileForm } from "@/features/profile/profile-form";
import { Loader2Icon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SignupPage() {
  const wallet = useWallet();
  const { user, isNewUser, isLoading } = useUserProfile(wallet.address);
  const router = useRouter();

  // Redirect based on connection and profile status
  useEffect(() => {
    if (wallet.status === "initializing" || isLoading) {
      return;
    }

    if (wallet.status !== "connected") {
      router.push("/login");
    } else if (user && !isNewUser) {
      router.push("/dashboard");
    }
  }, [wallet.status, user, isNewUser, isLoading, router]);

  if (wallet.status === "initializing" || isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2Icon className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-10 md:py-16">
        <div className="w-full max-w-4xl space-y-6">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-normal">
              <UserIcon className="size-7" />
              <span>Complete profile</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us a bit about yourself to get started with Velo.
            </p>
          </div>

          <ProfileForm mode="signup" onSuccess={() => router.push("/dashboard")} />

          <div className="text-center">
            <button
              onClick={() => wallet.disconnect()}
              className="cursor-pointer border-none bg-transparent text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Disconnect & Cancel
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
