import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  sign?: string;
  signPosition?: "left" | "right";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          type === "date" ? "block" : "flex",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

const InputPassword = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "password", ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="relative">
        <input
          type={showPassword ? "text" : type}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          ref={ref}
          {...props}
        />

        <div className="absolute inset-y-0 right-2 flex items-center">
          <button
            type="button"
            onClick={() => {
              setShowPassword(!showPassword);
            }}
          >
            {showPassword ? (
              <EyeOff className="size-5 text-gray-400" />
            ) : (
              <Eye className="size-5 text-gray-400" />
            )}
          </button>
        </div>
      </div>
    );
  },
);
InputPassword.displayName = "InputPassword";

const InputSign = React.forwardRef<HTMLInputElement, InputProps>(
  ({ sign, signPosition = "right", className, type, ...props }, ref) => {
    return (
      <div className="relative">
        {signPosition === "left" && (
          <div className="absolute inset-y-0 left-0">
            <div
              className={cn(
                "flex h-full items-center rounded-l-md border border-slate-300 bg-gray-200 px-2 text-xs font-medium text-gray-600 sm:px-4 sm:text-base",
                props.disabled && "border-slate-300 bg-gray-100",
              )}
            >
              {sign}
            </div>
          </div>
        )}
        <input
          type={type}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            signPosition === "left" ? "pl-[3.2rem] sm:pl-[4.8rem]" : "",
            className,
          )}
          ref={ref}
          {...props}
        />
        {signPosition === "right" && (
          <div className="absolute inset-y-0 right-0">
            <div
              className={cn(
                "flex h-full items-center rounded-r-md border border-slate-300 bg-gray-200 px-2 text-xs font-medium text-gray-600 sm:px-4 sm:text-base",
                props.disabled && "border-slate-300 bg-gray-100",
              )}
            >
              {sign}
            </div>
          </div>
        )}
      </div>
    );
  },
);
InputSign.displayName = "InputSign";

export { Input, InputPassword, InputSign };
