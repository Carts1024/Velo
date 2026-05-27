"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";

interface XScrollProps extends React.ComponentProps<typeof ScrollArea> {
  className?: string;
}

export default function XScroll({ children, className, ...props }: XScrollProps) {
  return (
    <div className="flex">
      <ScrollArea className={cn("w-1 flex-1", className)} {...props}>
        {children}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
