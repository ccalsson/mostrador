import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-leaf text-leaf-fg hover:brightness-95 shadow-[0_1px_0_rgba(0,0,0,0.08)]",
  secondary: "bg-surface text-ink border border-line hover:bg-paper-2",
  ghost: "bg-transparent text-ink hover:bg-paper-2",
  danger: "bg-terra text-white hover:brightness-95",
  warn: "bg-warn-bg text-terra hover:brightness-95",
};

const sizes = {
  sm: "h-9 px-3 text-sm rounded-[10px]",
  md: "h-11 px-4 text-sm rounded-md",
  lg: "h-12 px-5 text-base rounded-md",
  icon: "size-11 rounded-md",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out,ease)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
