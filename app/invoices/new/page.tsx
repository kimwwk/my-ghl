import { InvoiceEditor } from "@/components/invoice-editor";
import { editorProps } from "@/lib/editor-props";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const props = editorProps();
  const prefill = client ? (props.clients.find((c) => c.id === client) ?? null) : null;
  return <InvoiceEditor invoice={null} prefill={prefill} {...props} />;
}
