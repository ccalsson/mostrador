import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink outline-none placeholder:text-muted focus:border-leaf focus:ring-2 focus:ring-leaf/20",
          className,
        )}
        {...props}
      />
    );
  },
);
