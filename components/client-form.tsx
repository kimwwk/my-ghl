"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteClientAction, saveClientAction } from "@/app/actions";
import { type Client, formatDate } from "@/lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-mono mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

export function ClientForm({ client }: { client: Client | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(client?.name ?? "");
  const [company, setCompany] = useState(client?.company ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [cc, setCc] = useState((client?.cc ?? []).join(", "));
  const [address, setAddress] = useState(client?.address ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  const onSave = () =>
    start(async () => {
      const r = await saveClientAction(client?.id ?? null, { name, company, email, cc, address });
      if (!r.ok) {
        setProblem(r.error);
        return;
      }
      setProblem(null);
      toast.success("Client saved");
      if (!client) router.replace(`/clients/${r.id}`);
      else router.refresh();
    });

  const onDelete = () =>
    start(async () => {
      if (!client) return;
      if (!window.confirm(`Delete the saved client ${client.name}? Invoices already made for them stay as they are.`)) return;
      const r = await deleteClientAction(client.id);
      if (!r.ok) {
        setProblem(r.error);
        return;
      }
      toast.success("Client deleted");
      router.replace("/clients");
    });

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label-mono">
        <Link href="/clients" className="hover:underline">
          Clients
        </Link>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-1">
        <h1 className="text-3xl font-black">{client ? client.name : "New client"}</h1>
        {client && (
          <Link href={`/invoices/new?client=${client.id}`} className={buttonVariants()}>
            <Plus /> New invoice
          </Link>
        )}
      </div>
      {client && (
        <p className="pt-2 text-sm text-muted-foreground">
          {client.invoice_count === 0
            ? "No invoices yet."
            : `${client.invoice_count} invoice${client.invoice_count === 1 ? "" : "s"}, latest issued ${client.last_invoiced ? formatDate(client.last_invoiced) : "—"}.`}{" "}
          Changes here apply to new invoices; invoices already made keep the details they were sent with.
        </p>
      )}
      {problem && (
        <div role="alert" className="mt-4 border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          {problem}
        </div>
      )}
      <section className="mt-6 space-y-4 border-t border-foreground pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Company (optional)">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="CC (optional, comma separated)">
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </Field>
        </div>
        <Field label="Address">
          <Textarea rows={4} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onSave} disabled={pending}>
            {client ? "Save client" : "Add client"}
          </Button>
          {client && (
            <Button variant="ghost" onClick={onDelete} disabled={pending} className="text-destructive">
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
