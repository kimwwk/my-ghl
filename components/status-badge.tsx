import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  sent: "border-primary/30 bg-secondary text-inkdeep",
  paid: "border-primary bg-primary text-primary-foreground",
  void: "border-border bg-background text-caption line-through",
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  refunded: "border-border bg-muted text-muted-foreground",
  part_refunded: "border-primary/40 bg-background text-inkdeep",
};

const labels: Record<string, string> = { part_refunded: "part refunded" };

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 font-mono text-[11px] tracking-wider uppercase",
        styles[status] ?? styles.draft,
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
