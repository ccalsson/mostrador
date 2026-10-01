import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "leaf" | "terra" | "ok";
  className?: string;
}) {
  const tones = {
    muted: "bg-paper-2 text-ink-soft",
    leaf: "bg-ok-bg text-leaf",
    terra: "bg-warn-bg text-terra",
    ok: "bg-ok-bg text-ok",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
