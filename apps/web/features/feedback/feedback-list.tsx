"use client";

import { shortenAddress } from "@/core/wallet/format";
import { api } from "@repo/backend/convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useQuery } from "convex/react";
import { StarIcon } from "lucide-react";

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          className={`size-4 ${
            star <= rating ? "fill-amber-400 text-amber-400" : "fill-transparent text-zinc-300"
          }`}
        />
      ))}
    </div>
  );
}

export function FeedbackList() {
  const feedbackList = useQuery(api.feedback.query.listAll, { limit: 50 });

  if (feedbackList === undefined) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <p className="text-sm text-zinc-500">Loading feedback...</p>
      </div>
    );
  }

  if (feedbackList.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
        <p className="text-sm text-zinc-500">No feedback submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wallet</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead className="min-w-[200px]">Comment</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedbackList.map((feedback) => (
            <TableRow key={feedback._id}>
              <TableCell className="font-mono text-xs">
                {shortenAddress(feedback.walletAddress)}
              </TableCell>
              <TableCell>
                <RatingStars rating={feedback.rating} />
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm">{feedback.comment}</TableCell>
              <TableCell className="text-xs text-zinc-500">
                {new Date(feedback.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
