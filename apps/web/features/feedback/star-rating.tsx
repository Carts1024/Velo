"use client";

import { cn } from "@repo/ui/lib/utils";
import { StarIcon } from "lucide-react";
import { KeyboardEvent, useCallback, useState } from "react";

type StarRatingProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "size-5",
  md: "size-6",
  lg: "size-8",
};

export function StarRating({ value, onChange, disabled = false, size = "md" }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (disabled) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        onChange(Math.min(5, value + 1));
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        onChange(Math.max(0, value - 1));
      }
    },
    [disabled, value, onChange],
  );

  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      className="flex items-center gap-1"
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayValue;

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            disabled={disabled}
            tabIndex={-1}
            className={cn(
              "rounded-sm transition-colors focus-visible:outline-none",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
            onClick={() => {
              if (!disabled) {
                // Clicking same star toggles to 0
                onChange(star === value ? 0 : star);
              }
            }}
            onMouseEnter={() => {
              if (!disabled) {
                setHoverValue(star);
              }
            }}
            onMouseLeave={() => setHoverValue(null)}
          >
            <StarIcon
              className={cn(
                sizeClasses[size],
                "transition-colors",
                isFilled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-transparent text-zinc-300 hover:text-amber-200",
              )}
            />
          </button>
        );
      })}
      <span className="ml-2 text-sm text-zinc-500">{value}/5</span>
    </div>
  );
}
