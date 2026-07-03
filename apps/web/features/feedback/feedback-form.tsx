"use client";

import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { Loader2Icon, SendIcon, WalletIcon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { StarRating } from "./star-rating";

const COMMENT_MAX = 2000;

export function FeedbackForm() {
  const wallet = useWallet();
  const { isAuthenticated } = useConvexAuth();
  const submitFeedback = useMutation(api.feedback.mutation.submitFeedback);
  const existingFeedback = useQuery(
    api.feedback.query.getByWallet,
    wallet.address && isAuthenticated ? {} : "skip",
  );

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Pre-fill from existing feedback
  useEffect(() => {
    if (existingFeedback && !hasLoaded) {
      setRating(existingFeedback.rating);
      setComment(existingFeedback.comment);
      setHasLoaded(true);
    }
  }, [existingFeedback, hasLoaded]);

  if (!wallet.address) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
        <WalletIcon className="mx-auto mb-3 size-10 text-zinc-400" />
        <h3 className="text-lg font-semibold">Connect your wallet</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Connect a Stellar wallet to share your feedback.
        </p>
        <Button className="mt-4" onClick={wallet.connect}>
          <WalletIcon className="size-4" />
          Connect wallet
        </Button>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    const trimmedComment = comment.trim();
    if (trimmedComment.length === 0) {
      toast.error("Please enter a comment");
      return;
    }

    if (trimmedComment.length > COMMENT_MAX) {
      toast.error(`Comment must be ${COMMENT_MAX} characters or less`);
      return;
    }

    if (!wallet.address) {
      toast.error("Wallet not connected");
      return;
    }

    setIsSaving(true);

    try {
      await submitFeedback({
        rating,
        comment: trimmedComment,
      });
      toast.success(existingFeedback ? "Feedback updated!" : "Thanks for your feedback!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit feedback");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="feedback-rating">How would you rate Velo?</Label>
          <StarRating value={rating} onChange={setRating} disabled={isSaving} size="lg" />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="feedback-comment">Your feedback</Label>
            <span className="text-xs text-zinc-400">
              {comment.length}/{COMMENT_MAX}
            </span>
          </div>
          <Textarea
            id="feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us what you think about Velo — what's working well, what could be improved..."
            maxLength={COMMENT_MAX}
            className="min-h-32"
            required
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isSaving || rating === 0}>
            {isSaving ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <SendIcon className="size-4" />
                {existingFeedback ? "Update feedback" : "Submit feedback"}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
