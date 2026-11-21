import { notFound } from "next/navigation";
import { ClientForm } from "@/components/client-form";
import { clientById } from "@/lib/clients";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = clientById(id);
  if (!client) notFound();
  return <ClientForm key={`${client.id}-${client.updated_at}`} client={client} />;
}
