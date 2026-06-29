"use client";

import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useMutation } from "convex/react";
import { Loader2Icon, UserIcon } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import type { Doc } from "@repo/backend/convex/_generated/dataModel";

const NAME_MAX = 100;
const EMAIL_MAX = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OnboardingDialogProps = {
  open: boolean;
  onComplete: () => void;
  existingProfile?: Doc<"users"> | null;
};

export function OnboardingDialog({ open, onComplete, existingProfile }: OnboardingDialogProps) {
  const wallet = useWallet();
  const upsertProfile = useMutation(api.users.mutation.upsertProfile);

  const isEditing = !!existingProfile;

  const [name, setName] = useState(existingProfile?.name ?? "");
  const [email, setEmail] = useState(existingProfile?.email ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  function validateName(value: string): string | null {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return "Name is required";
    }

    if (trimmed.length > NAME_MAX) {
      return `Name must be ${NAME_MAX} characters or less`;
    }

    return null;
  }

  function validateEmail(value: string): string | null {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return "Email is required";
    }

    if (trimmed.length > EMAIL_MAX) {
      return `Email must be ${EMAIL_MAX} characters or less`;
    }

    if (!EMAIL_PATTERN.test(trimmed)) {
      return "Enter a valid email address";
    }

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
        walletAddress: wallet.address,
        name: name.trim(),
        email: email.trim(),
      });
      toast.success(isEditing ? "Profile updated" : "Welcome to Velo!");
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={isEditing ? (v) => !v && onComplete() : undefined}>
      <DialogContent showCloseButton={isEditing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="size-5" />
            {isEditing ? "Edit profile" : "Complete your profile"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your name and email."
              : "Tell us a bit about yourself to get started with Velo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="onboarding-name">Name</Label>
            <Input
              id="onboarding-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              placeholder="Your name"
              maxLength={NAME_MAX}
              required
              aria-invalid={!!nameError}
            />
            {nameError ? <p className="text-sm text-red-600">{nameError}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="onboarding-email">Email</Label>
            <Input
              id="onboarding-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              placeholder="you@example.com"
              maxLength={EMAIL_MAX}
              required
              aria-invalid={!!emailError}
            />
            {emailError ? <p className="text-sm text-red-600">{emailError}</p> : null}
          </div>

          <DialogFooter>
            {isEditing ? (
              <Button type="button" variant="outline" onClick={onComplete}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                "Save changes"
              ) : (
                "Get started"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
