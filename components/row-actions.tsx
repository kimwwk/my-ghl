"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { duplicateInvoiceAction, syncInvoiceAction } from "@/app/actions";

export function RowActions({ id, status, link }: { id: string; status: string; link: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link href={`/invoices/${id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
        {status === "draft" ? "Edit" : "Open"}
      </Link>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await duplicateInvoiceAction(id);
            if (r.ok) router.push(`/invoices/${r.id}`);
            else toast.error(r.error);
          })
        }
      >
        Duplicate
      </Button>
      {link && (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast.success("Payment link copied");
            } catch {
              toast.error("Could not copy. Open the invoice to copy the link.");
            }
          }}
        >
          Copy link
        </Button>
      )}
      {status === "sent" && link && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await syncInvoiceAction(id);
              if (r.ok) {
                toast.message(r.note);
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          Sync
        </Button>
      )}
    </div>
  );
}
