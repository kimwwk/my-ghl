import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { RowActions } from "@/components/row-actions";
import { StatusBadge } from "@/components/status-badge";
import { listInvoices, matchesFilter } from "@/lib/invoices";
import { autoSyncSent } from "@/lib/stripe";
import { formatDate, formatMoney, formatMoneyGhl } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const filters = ["all", "draft", "sent", "overdue", "paid", "refunded", "void"] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  await Promise.race([autoSyncSent(), new Promise((r) => setTimeout(r, 4000))]);
  const all = listInvoices();
  const list = all.filter((i) => matchesFilter(i, status));
  const count = (f: string) => all.filter((i) => matchesFilter(i, f)).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono">Kivov Digital</p>
          <h1 className="pt-1 text-3xl font-black">Invoices</h1>
        </div>
        <Link href="/invoices/new" className={buttonVariants()}>
          <Plus /> New invoice
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {filters.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/" : `/?status=${f}`}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm capitalize text-muted-foreground hover:text-foreground",
              status === f && "border-primary font-semibold text-foreground",
            )}
          >
            {f} <span className="font-mono text-xs text-caption">{count(f)}</span>
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-10 border border-dashed border-border p-10 text-center text-muted-foreground">
          {all.length === 0 ? "No invoices yet. Create your first one." : `No ${status} invoices.`}
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-foreground text-left">
                {["Number", "Client", "Total", "Status", "Issued", "Due", ""].map((h) => (
                  <th key={h} className="label-mono px-2 py-3 font-normal first:pl-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="border-b border-border hover:bg-muted/60">
                  <td className="px-2 py-3 pl-0 font-mono">
                    <Link href={`/invoices/${i.id}`} className="text-primary underline-offset-4 hover:underline">
                      {i.number}
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    <div className="font-medium text-foreground">{i.bill_to.name || "—"}</div>
                    {i.bill_to.company && <div className="text-xs text-caption">{i.bill_to.company}</div>}
                  </td>
                  <td className="px-2 py-3 font-mono whitespace-nowrap">
                    {formatMoney(i.total_cents, i.currency)}
                    {i.refund && (
                      <div className="text-xs text-caption">−{formatMoneyGhl(i.refund.cents, i.currency)} refunded</div>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <StatusBadge status={i.display_status} />
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap text-muted-foreground">{formatDate(i.issue_date)}</td>
                  <td className="px-2 py-3 whitespace-nowrap text-muted-foreground">{formatDate(i.due_date)}</td>
                  <td className="px-2 py-3 pr-0">
                    <RowActions id={i.id} status={i.status} link={i.stripe.active ? i.stripe.url : null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
