"use client";

import { CopyButton } from "@repo/ui/components/common/copy-button";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";

type PublicEvent = {
  eventId: string;
  contractId: string;
  transactionHash: string;
  ledger: number;
  timestamp?: number;
  topic: string;
  type: string;
  decoded?: unknown;
  observedAt: number;
};

function shortValue(value: string, leading = 10, trailing = 6) {
  if (value.length <= leading + trailing + 3) {
    return value;
  }

  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

function eventLabel(event: PublicEvent) {
  try {
    const parsed = JSON.parse(event.topic);
    return typeof parsed === "string" ? parsed : event.topic;
  } catch {
    return event.topic;
  }
}

function formatTimestamp(event: PublicEvent) {
  return new Date(event.timestamp ?? event.observedAt).toLocaleString();
}

export function EventActivityTable({
  events,
  emptyMessage,
}: {
  events: PublicEvent[];
  emptyMessage: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>Contract</TableHead>
          <TableHead>Transaction</TableHead>
          <TableHead>Ledger</TableHead>
          <TableHead className="text-right">Observed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-8 text-center text-sm text-zinc-600">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          events.map((event) => (
            <TableRow key={event.eventId}>
              <TableCell>
                <div className="grid gap-1">
                  <span className="font-medium">{eventLabel(event)}</span>
                  <Badge variant="gray" className="w-fit">
                    {event.type}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                <div className="flex items-center gap-1">
                  <span title={event.contractId}>{shortValue(event.contractId)}</span>
                  <CopyButton value={event.contractId} label="contract ID" />
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                <div className="flex items-center gap-1">
                  <span title={event.transactionHash}>{shortValue(event.transactionHash)}</span>
                  <CopyButton value={event.transactionHash} label="transaction hash" />
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{event.ledger}</TableCell>
              <TableCell className="text-right text-sm text-zinc-600">
                {formatTimestamp(event)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
