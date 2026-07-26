"use client";

import { useWallet } from "@/core/wallet/wallet-provider";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  validateAvatar,
  validateEmail,
  validateName,
} from "@/features/profile/profile-validation";
import { api } from "@repo/backend/convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useMutation } from "convex/react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ImagePlusIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

type ProfileFormProps = {
  mode: "signup" | "edit";
  initialName?: string;
  initialEmail?: string;
  initialAvatarUrl?: string;
  onSuccess: () => void;
};

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || "VE").toUpperCase();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Profile could not be saved";
}

export function ProfileForm({
  mode,
  initialName = "",
  initialEmail = "",
  initialAvatarUrl,
  onSuccess,
}: ProfileFormProps) {
  const wallet = useWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlRef = useRef<string | null>(null);
  const upsertProfile = useMutation(api.users.mutation.upsertProfile);
  const generateAvatarUploadUrl = useMutation(api.users.mutation.generateAvatarUploadUrl);
  const removeAvatar = useMutation(api.users.mutation.removeAvatar);

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
      }
    };
  }, []);

  function replacePreview(nextUrl: string | null, isLocal: boolean) {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }

    if (isLocal && nextUrl) {
      localPreviewUrlRef.current = nextUrl;
    }

    setAvatarPreviewUrl(nextUrl);
  }

  function selectAvatar(file: File | null) {
    setAvatarError(null);
    setFormError(null);
    setSaved(false);

    if (!file) {
      setSelectedAvatar(null);
      replacePreview(initialAvatarUrl ?? null, false);
      return;
    }

    const validationError = validateAvatar(file);
    if (validationError) {
      setAvatarError(validationError);
      setSelectedAvatar(null);
      replacePreview(initialAvatarUrl ?? null, false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedAvatar(file);
    replacePreview(previewUrl, true);
  }

  async function uploadAvatar(file: File) {
    const uploadUrl = await generateAvatarUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!response.ok) {
      throw new Error("Profile picture upload failed");
    }

    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return storageId;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextNameError = validateName(name);
    const nextEmailError = validateEmail(email);
    setNameError(nextNameError);
    setEmailError(nextEmailError);
    setFormError(null);
    setSaved(false);

    if (nextNameError || nextEmailError || avatarError) {
      return;
    }

    if (!wallet.address) {
      setFormError("Connect your wallet before saving your profile");
      return;
    }

    setIsSaving(true);

    try {
      const avatarStorageId = selectedAvatar ? await uploadAvatar(selectedAvatar) : undefined;
      await upsertProfile({
        name: name.trim(),
        email: email.trim(),
        ...(avatarStorageId ? { avatarStorageId } : {}),
      });

      setSelectedAvatar(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSaved(true);
      toast.success(mode === "signup" ? "Welcome to Velo!" : "Profile updated");
      onSuccess();
    } catch (error) {
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError(null);
    setFormError(null);
    setSaved(false);

    if (selectedAvatar) {
      setSelectedAvatar(null);
      replacePreview(initialAvatarUrl ?? null, false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (mode === "signup" || !avatarPreviewUrl) {
      return;
    }

    setIsRemovingAvatar(true);

    try {
      await removeAvatar({});
      replacePreview(null, false);
      setSaved(true);
      toast.success("Profile picture removed");
    } catch (error) {
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setIsRemovingAvatar(false);
    }
  }

  const busy = isSaving || isRemovingAvatar;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <form
        onSubmit={handleSubmit}
        className="order-2 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6 lg:order-1"
      >
        <div className="grid gap-5">
          {formError ? (
            <Alert variant="destructive" role="alert">
              <AlertCircleIcon />
              <AlertTitle>Profile was not saved</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {saved ? (
            <Alert role="status">
              <CheckCircle2Icon />
              <AlertTitle>{mode === "signup" ? "Profile created" : "Changes saved"}</AlertTitle>
              <AlertDescription>
                {mode === "signup" ? "Your Velo profile is ready." : "Your profile is up to date."}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={`${mode}-profile-name`}>Name</Label>
            <Input
              id={`${mode}-profile-name`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
                setSaved(false);
              }}
              placeholder="Your name"
              maxLength={NAME_MAX_LENGTH}
              required
              aria-invalid={!!nameError}
              aria-describedby={nameError ? `${mode}-profile-name-error` : undefined}
            />
            {nameError ? (
              <p id={`${mode}-profile-name-error`} className="text-sm text-destructive">
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${mode}-profile-email`}>Email</Label>
            <Input
              id={`${mode}-profile-email`}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
                setSaved(false);
              }}
              placeholder="you@example.com"
              maxLength={EMAIL_MAX_LENGTH}
              required
              aria-invalid={!!emailError}
              aria-describedby={emailError ? `${mode}-profile-email-error` : undefined}
            />
            {emailError ? (
              <p id={`${mode}-profile-email-error`} className="text-sm text-destructive">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Button type="submit" disabled={busy}>
              {isSaving ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Saving...
                </>
              ) : mode === "signup" ? (
                "Get started"
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>
      </form>

      <aside className="order-1 rounded-xl border border-border bg-card p-5 shadow-sm lg:order-2">
        <div>
          <h2 className="font-semibold">Profile picture</h2>
          <p className="mt-1 text-sm text-muted-foreground">Optional image, up to 2 MB.</p>
        </div>

        <Avatar className="mx-auto mt-6 size-32 border border-border">
          {avatarPreviewUrl ? (
            <AvatarImage src={avatarPreviewUrl} alt={`${name || "User"} profile picture`} />
          ) : null}
          <AvatarFallback className="text-3xl">{initialsFor(name)}</AvatarFallback>
        </Avatar>

        <div className="mt-6 grid gap-3">
          <Label htmlFor={`${mode}-profile-avatar`} className="sr-only">
            Choose profile picture
          </Label>
          <Input
            ref={fileInputRef}
            id={`${mode}-profile-avatar`}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => selectAvatar(event.target.files?.[0] ?? null)}
            aria-invalid={!!avatarError}
            aria-describedby={avatarError ? `${mode}-profile-avatar-error` : undefined}
          />
          {avatarError ? (
            <p id={`${mode}-profile-avatar-error`} className="text-sm text-destructive">
              {avatarError}
            </p>
          ) : null}

          {avatarPreviewUrl ? (
            <Button type="button" variant="outline" disabled={busy} onClick={handleRemoveAvatar}>
              {isRemovingAvatar ? (
                <Loader2Icon className="animate-spin" />
              ) : selectedAvatar ? (
                <ImagePlusIcon />
              ) : (
                <Trash2Icon />
              )}
              {isRemovingAvatar
                ? "Removing..."
                : selectedAvatar
                  ? "Clear selection"
                  : "Remove picture"}
            </Button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
