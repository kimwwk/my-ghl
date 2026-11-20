import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

/** Invoices brought over from GoHighLevel keep the PDF the client received at data/imports/<number>.pdf. */
export function originalPdfPath(number: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(number)) return null;
  const p = path.join(DATA_DIR, "imports", `${number}.pdf`);
  return fs.existsSync(p) ? p : null;
}
