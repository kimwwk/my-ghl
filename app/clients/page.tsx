import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { listClients } from "@/lib/clients";
import { formatDate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function ClientsPage() {
  const clients = listClients();
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono">Kivov Digital</p>
          <h1 className="pt-1 text-3xl font-black">Clients</h1>
          <p className="pt-2 text-sm text-muted-foreground">
            Saved automatically from every invoice you save. Pick one under Bill to on a new invoice.
          </p>
        </div>
        <Link href="/clients/new" className={buttonVariants({ variant: "outline" })}>
          <Plus /> Add client
        </Link>
      </div>
      {clients.length === 0 ? (
        <div className="mt-10 border border-dashed border-border p-10 text-center text-muted-foreground">
          No saved clients yet. They appear here once you save an invoice.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-foreground text-left">
                {["Client", "Email", "Address", "Invoices", "Last invoiced", ""].map((h) => (
                  <th key={h} className="label-mono px-2 py-3 font-normal first:pl-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border align-top hover:bg-muted/60">
                  <td className="px-2 py-3 pl-0">
                    <Link href={`/clients/${c.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    {c.company && <div className="text-xs text-caption">{c.company}</div>}
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">{c.email || "—"}</td>
                  <td className="px-2 py-3 whitespace-pre-line text-muted-foreground">{c.address || "—"}</td>
                  <td className="px-2 py-3 font-mono">{c.invoice_count}</td>
                  <td className="px-2 py-3 whitespace-nowrap text-muted-foreground">
                    {c.last_invoiced ? formatDate(c.last_invoiced) : "—"}
                  </td>
                  <td className="px-2 py-3 pr-0 text-right">
                    <Link href={`/invoices/new?client=${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      New invoice
                    </Link>
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
