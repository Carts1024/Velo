"use client";

import { AppShell } from "@/core/app-shell";
import { useWallet } from "@/core/wallet/wallet-provider";
import { useUserProfile } from "@/features/onboarding/use-user-profile";
import { ProfileForm } from "@/features/profile/profile-form";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { UserIcon } from "lucide-react";

export default function ProfilePage() {
  const wallet = useWallet();
  const { user, isLoading } = useUserProfile(wallet.address);

  if (wallet.status === "initializing" || isLoading || !user) {
    return (
      <AppShell>
        <section className="mx-auto grid w-full max-w-4xl gap-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-80 w-full" />
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="mx-auto grid w-full max-w-4xl gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-normal">
            <UserIcon className="size-7" />
            Edit profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Update the personal details shown across your Velo workspace.
          </p>
        </div>

        <ProfileForm
          key={user._id}
          mode="edit"
          initialName={user.name}
          initialEmail={user.email}
          initialAvatarUrl={user.avatarUrl}
          onSuccess={() => undefined}
        />
      </section>
    </AppShell>
  );
}
