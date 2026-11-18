import { InvoiceEditor } from "@/components/invoice-editor";
import { editorProps } from "@/lib/editor-props";

export const dynamic = "force-dynamic";

export default function NewInvoicePage() {
  return <InvoiceEditor invoice={null} {...editorProps()} />;
}
