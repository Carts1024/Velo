"use client";

import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import useLocalStorage from "../../hooks/useLocalStorage";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface AdvancedDateRangePickerProps {
  className?: string;
  value?: DateRange;
  onChange?: (value: DateRange) => void;
}

const getDefaultDateRange = (): DateRange => {
  const today = new Date();

  return {
    from: startOfMonth(today),
    to: endOfMonth(today),
  };
};

const parseDateRange = (value: unknown): DateRange | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const { from, to } = value as { from?: string | Date; to?: string | Date };
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  if (!fromDate || !toDate || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return undefined;
  }

  return {
    from: fromDate,
    to: toDate,
  };
};

export function AdvancedDateRangePicker({
  className,
  value,
  onChange,
  ...props
}: AdvancedDateRangePickerProps) {
  const [date, setDate] = useLocalStorage<DateRange | undefined>("rangeDatePicker", undefined);
  const displayDate = date ?? value;
  const [isOpen, setIsOpen] = React.useState(false);
  const lastNotifiedDate = React.useRef<DateRange | undefined>(undefined);

  const presets = [
    {
      label: "Today",
      getValue: () => ({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
      }),
    },
    {
      label: "Yesterday",
      getValue: () => ({
        from: startOfDay(addDays(new Date(), -1)),
        to: endOfDay(addDays(new Date(), -1)),
      }),
    },
    {
      label: "This Week",
      getValue: () => ({
        from: startOfWeek(new Date()),
        to: endOfWeek(new Date()),
      }),
    },
    {
      label: "Last Week",
      getValue: () => ({
        from: startOfWeek(addDays(new Date(), -7)),
        to: endOfWeek(addDays(new Date(), -7)),
      }),
    },
    {
      label: "This Month",
      getValue: () => ({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
      }),
    },
    {
      label: "Last Month",
      getValue: () => ({
        from: startOfMonth(subMonths(new Date(), 1)),
        to: endOfMonth(subMonths(new Date(), 1)),
      }),
    },
    {
      label: "This Year",
      getValue: () => ({
        from: new Date(new Date().getFullYear(), 0, 1),
        to: new Date(new Date().getFullYear(), 11, 31),
      }),
    },
    {
      label: "Last Year",
      getValue: () => ({
        from: new Date(new Date().getFullYear() - 1, 0, 1),
        to: new Date(new Date().getFullYear() - 1, 11, 31),
      }),
    },
  ];

  React.useEffect(() => {
    if (date && lastNotifiedDate.current !== date) {
      lastNotifiedDate.current = date;
      onChange?.(date);
    }
  }, [date, onChange]);

  React.useEffect(() => {
    setDate((storedDate) => parseDateRange(storedDate) ?? value ?? getDefaultDateRange());
  }, [setDate, value]);

  return (
    <div className={cn("grid gap-2")}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "min-w-max justify-start gap-2.5 text-left font-normal",
              !displayDate && "text-muted-foreground",
              className,
            )}
            {...props}
          >
            <CalendarIcon className="size-4" />
            {displayDate?.from ? (
              <>
                {format(displayDate.from, "LLL dd, y")} - {format(displayDate.to, "LLL dd, y")}
              </>
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 font-sans" align="start">
          <div className="flex h-[300px] flex-col">
            <ScrollArea className="min-h-[300px] flex-1">
              <div className="flex">
                <div className="w-32 space-y-1 border-r p-2">
                  {presets.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs font-normal"
                      onClick={() => {
                        const newDate = preset.getValue();
                        setDate(newDate);
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-3 p-3">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setDate((prev) => {
                          const currentDate = prev ?? value ?? getDefaultDateRange();
                          const newDate = {
                            ...currentDate,
                            from: addDays(currentDate.from, -30),
                            to: addDays(currentDate.to, -30),
                          };
                          return newDate;
                        });
                      }}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setDate((prev) => {
                          const currentDate = prev ?? value ?? getDefaultDateRange();
                          const newDate = {
                            ...currentDate,
                            from: addDays(currentDate.from, 30),
                            to: addDays(currentDate.to, 30),
                          };
                          return newDate;
                        })
                      }
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                  <div className="flex space-x-2">
                    <Calendar
                      mode="range"
                      defaultMonth={displayDate?.from}
                      selected={displayDate}
                      onSelect={(newDate) => {
                        if (newDate) {
                          const currentDate = displayDate ?? getDefaultDateRange();
                          const _newDate = {
                            from: newDate.from || currentDate.from,
                            to: newDate.to || currentDate.to,
                          };
                          setDate(_newDate);
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </div>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <Input
                      type="date"
                      value={displayDate ? format(displayDate.from, "yyyy-MM-dd") : ""}
                      onChange={(e) => {
                        setDate((prev) => {
                          const currentDate = prev ?? value ?? getDefaultDateRange();
                          const newDate = {
                            ...currentDate,
                            from: new Date(e.target.value),
                          };
                          return newDate;
                        });
                      }}
                    />
                    <Input
                      type="date"
                      value={displayDate ? format(displayDate.to, "yyyy-MM-dd") : ""}
                      onChange={(e) => {
                        setDate((prev) => {
                          const currentDate = prev ?? value ?? getDefaultDateRange();
                          const newDate = {
                            ...currentDate,
                            to: new Date(e.target.value),
                          };
                          return newDate;
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
