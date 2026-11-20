import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice-editor";
import { editorProps } from "@/lib/editor-props";
import { getInvoice } from "@/lib/invoices";
import { originalPdfPath } from "@/lib/originals";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = getInvoice(id);
  if (!invoice) notFound();
  // key forces the editor to re-initialise after a server refresh of the same invoice
  return <InvoiceEditor key={`${invoice.id}-${invoice.updated_at}`} invoice={invoice} hasOriginal={!!originalPdfPath(invoice.number)} {...editorProps()} />;
}
