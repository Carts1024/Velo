"use client";

import { AppShell } from "@/core/app-shell";
import { useWallet } from "@/core/wallet/wallet-provider";
import { useUserProfile } from "@/features/onboarding/use-user-profile";
import { api } from "@repo/backend/convex/_generated/api";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useMutation } from "convex/react";
import { Loader2Icon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

const NAME_MAX = 100;
const EMAIL_MAX = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const wallet = useWallet();
  const { user, isNewUser, isLoading } = useUserProfile(wallet.address);
  const upsertProfile = useMutation(api.users.mutation.upsertProfile);
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

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

  function validateName(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "Name is required";
    if (trimmed.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or less`;
    return null;
  }

  function validateEmail(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "Email is required";
    if (trimmed.length > EMAIL_MAX) return `Email must be ${EMAIL_MAX} characters or less`;
    if (!EMAIL_PATTERN.test(trimmed)) return "Enter a valid email address";
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nameErr = validateName(name);
    const emailErr = validateEmail(email);
    setNameError(nameErr);
    setEmailError(emailErr);

    if (nameErr || emailErr) {
      return;
    }

    if (!wallet.address) {
      toast.error("Wallet not connected");
      return;
    }

    setIsSaving(true);

    try {
      await upsertProfile({
        name: name.trim(),
        email: email.trim(),
      });
      toast.success("Welcome to Velo!");
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  }

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
      <div className="flex flex-col items-center justify-center py-12 md:py-24">
        <div className="w-full max-w-md space-y-6">
          {/* Signup Card */}
          <div className="rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
            <div className="space-y-2 mb-6">
              <h1 className="text-2xl font-semibold tracking-normal text-zinc-900 flex items-center gap-2">
                <UserIcon className="size-5" />
                <span>Complete Profile</span>
              </h1>
              <p className="text-sm text-zinc-600">
                Tell us a bit about yourself to get started with Velo dashboard.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="signup-name" className="text-zinc-700">
                  Name
                </Label>
                <Input
                  id="signup-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                  }}
                  placeholder="Your name"
                  maxLength={NAME_MAX}
                  required
                  className="bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400"
                  aria-invalid={!!nameError}
                />
                {nameError ? <p className="text-xs text-red-600">{nameError}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="signup-email" className="text-zinc-700">
                  Email
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                  placeholder="you@example.com"
                  maxLength={EMAIL_MAX}
                  required
                  className="bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400"
                  aria-invalid={!!emailError}
                />
                {emailError ? <p className="text-xs text-red-600">{emailError}</p> : null}
              </div>

              <Button type="submit" disabled={isSaving} className="w-full mt-2">
                {isSaving ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Get Started</span>
                )}
              </Button>
            </form>
          </div>

          {/* Cancel/Disconnect Link */}
          <div className="text-center">
            <button
              onClick={() => wallet.disconnect()}
              className="text-xs text-zinc-500 hover:text-zinc-700 transition-colors bg-transparent border-none cursor-pointer"
            >
              ← Disconnect & Cancel
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
