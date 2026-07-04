"use client";

import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import { AlertCircleIcon, CheckCircle2Icon, ImageIcon, Trash2Icon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

const maxLogoSizeBytes = 2 * 1024 * 1024;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Project settings could not be saved";
}

export function ProjectSettings({ projectId }: { projectId: string }) {
  const wallet = useWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typedProjectId = projectId as Id<"projects">;
  const project = useQuery(
    api.projects.query.getById,
    wallet.address ? { id: typedProjectId } : "skip",
  );
  const updateSettings = useMutation(api.projects.mutation.updateSettings);
  const generateLogoUploadUrl = useMutation(api.projects.mutation.generateLogoUploadUrl);
  const setLogo = useMutation(api.projects.mutation.setLogo);
  const removeLogo = useMutation(api.projects.mutation.removeLogo);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description);
  }, [project]);

  const selectedLogoUrl = useMemo(() => {
    return selectedLogo ? URL.createObjectURL(selectedLogo) : null;
  }, [selectedLogo]);

  useEffect(() => {
    return () => {
      if (selectedLogoUrl) {
        URL.revokeObjectURL(selectedLogoUrl);
      }
    };
  }, [selectedLogoUrl]);

  function selectLogo(file: File | null) {
    setFormError(null);
    setSaved(false);

    if (!file) {
      setSelectedLogo(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFormError("Project logo must be an image file.");
      setSelectedLogo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > maxLogoSizeBytes) {
      setFormError("Project logo must be 2 MB or smaller.");
      setSelectedLogo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedLogo(file);
  }

  async function uploadLogo(file: File) {
    const uploadUrl = await generateLogoUploadUrl({ id: typedProjectId });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!response.ok) {
      throw new Error("Logo upload failed");
    }

    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    await setLogo({ id: typedProjectId, logoStorageId: storageId });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSaved(false);

    if (!name.trim()) {
      setFormError("Project name is required.");
      return;
    }

    if (!description.trim()) {
      setFormError("Project description is required.");
      return;
    }

    setIsSaving(true);

    try {
      await updateSettings({ id: typedProjectId, name, description });

      if (selectedLogo) {
        await uploadLogo(selectedLogo);
        setSelectedLogo(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }

      setSaved(true);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveLogo() {
    setFormError(null);
    setSaved(false);
    setIsRemovingLogo(true);

    try {
      await removeLogo({ id: typedProjectId });
      setSelectedLogo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSaved(true);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setIsRemovingLogo(false);
    }
  }

  if (!wallet.address) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-normal">Project settings</h1>
        <Alert>
          <WalletIcon />
          <AlertTitle>Connect the owner wallet</AlertTitle>
          <AlertDescription>
            Project settings load only after wallet ownership is verified.
          </AlertDescription>
        </Alert>
        <Button onClick={wallet.connect} className="w-fit">
          <WalletIcon />
          Connect wallet
        </Button>
      </section>
    );
  }

  if (project === undefined) {
    return (
      <section className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (project === null) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-normal">Project settings</h1>
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Project unavailable</AlertTitle>
          <AlertDescription>
            The project does not exist or the connected wallet is not its owner.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Project settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Update owner-facing project configuration. Registry metadata hash stays unchanged.
          </p>
        </div>

        {formError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Settings were not saved</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        {saved ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Settings saved</AlertTitle>
            <AlertDescription>Project configuration has been updated.</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="settings-project-name">Project name</Label>
              <Input
                id="settings-project-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="settings-project-description">Description</Label>
              <Textarea
                id="settings-project-description"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setSaved(false);
                }}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="settings-project-logo">Logo</Label>
              <Input
                ref={fileInputRef}
                id="settings-project-logo"
                type="file"
                accept="image/*"
                onChange={(event) => selectLogo(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-zinc-500">Optional image, 2 MB maximum.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSaving || isRemovingLogo}>
                {isSaving ? "Saving..." : selectedLogo ? "Save and upload logo" : "Save settings"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/projects/${project._id}`}>Project overview</Link>
              </Button>
            </div>
          </div>
        </form>
      </div>

      <aside className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="text-base font-semibold tracking-normal">Project logo</h2>
          <p className="mt-1 text-sm text-zinc-600">Shown in the sidebar project switcher.</p>
        </div>
        <div className="flex aspect-square w-32 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
          {selectedLogoUrl ? (
            <img src={selectedLogoUrl} alt="" className="size-full object-cover" />
          ) : project.logoUrl ? (
            <img src={project.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-10 text-zinc-400" />
          )}
        </div>
        {project.logoUrl ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleRemoveLogo}
            disabled={isSaving || isRemovingLogo}
            className="w-fit"
          >
            <Trash2Icon />
            {isRemovingLogo ? "Removing..." : "Remove logo"}
          </Button>
        ) : null}
      </aside>
    </section>
  );
}
