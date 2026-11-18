import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { buildDocView, type DocInvoice } from "./invoice-view";
import type { BusinessProfile } from "./types";

const INK = "#101828";
const MUTED = "#667085";
const HAIR = "#eaecf0";

export async function renderInvoicePdf(
  inv: DocInvoice,
  b: BusinessProfile,
  logo: { buf: Buffer; contentType: string },
): Promise<Buffer> {
  const v = buildDocView(inv, b);
  const s = StyleSheet.create({
    page: { padding: 40, fontFamily: "Helvetica", fontSize: 9.5, color: INK },
    title: { textAlign: "right", fontSize: 26, color: "#000000", paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: "#000000" },
    biz: { flexDirection: "row", justifyContent: "space-between", paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: HAIR },
    muted: { color: MUTED },
    label: { color: INK, fontFamily: "Helvetica-Bold", fontSize: 9.5 },
    meta: { flexDirection: "row", alignItems: "flex-start", paddingTop: 14, paddingBottom: 18 },
    th: { fontSize: 8.5, color: "#000000", textTransform: "uppercase", letterSpacing: 0.3 },
  });
  const isPng = logo.contentType === "image/png";
  const cols = { name: "44%", price: "18%", qty: "8%", tax: "10%", sub: "20%" } as const;
  const doc = (
    <Document title={`Invoice ${v.number}`} author={b.display_name}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>INVOICE</Text>
        <View style={s.biz}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={{ data: logo.buf, format: isPng ? "png" : "jpg" }} style={{ height: 44, objectFit: "contain", objectPositionX: 0 }} />
          <View style={{ alignItems: "flex-end", maxWidth: "55%" }}>
            <Text style={{ fontSize: 13, color: "#000000" }}>{v.business.name}</Text>
            {v.business.lines.map((l, i) => (
              <Text key={i} style={{ ...s.muted, marginTop: 3, fontSize: 9, textAlign: "right" }}>
                {l}
              </Text>
            ))}
          </View>
        </View>

        <View style={s.meta}>
          <View style={{ width: "42%" }}>
            <Text style={s.label}>Billed to</Text>
            {v.billedTo.map((l, i) => (
              <Text key={i} style={{ ...s.muted, marginTop: 3 }}>
                {l}
              </Text>
            ))}
          </View>
          <View style={{ width: "24%" }}>
            <Text style={s.label}>Invoice No</Text>
            <Text style={s.muted}>{v.number}</Text>
          </View>
          <View style={{ width: "34%" }}>
            <Text style={s.label}>Issue Date</Text>
            <Text style={{ ...s.muted, marginBottom: 8 }}>{v.issueDate}</Text>
            <Text style={s.label}>Due Date</Text>
            <Text style={s.muted}>{v.dueDate}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1.5, borderBottomColor: v.accent }}>
          <Text style={{ ...s.th, width: cols.name }}>Item name</Text>
          <Text style={{ ...s.th, width: cols.price, textAlign: "right" }}>Price</Text>
          <Text style={{ ...s.th, width: cols.qty, textAlign: "center" }}>Qty</Text>
          <Text style={{ ...s.th, width: cols.tax, textAlign: "center" }}>Tax</Text>
          <Text style={{ ...s.th, width: cols.sub, textAlign: "right" }}>Subtotal</Text>
        </View>
        {v.rows.map((r, i) => (
          <View key={i} wrap={false} style={{ flexDirection: "row", paddingVertical: 7 }}>
            <View style={{ width: cols.name, paddingRight: 8 }}>
              <Text>{r.name}</Text>
              {r.description ? <Text style={s.muted}>{r.description}</Text> : null}
            </View>
            <Text style={{ width: cols.price, textAlign: "right" }}>{r.price}</Text>
            <Text style={{ width: cols.qty, textAlign: "center" }}>{r.qty}</Text>
            <Text style={{ width: cols.tax, textAlign: "center" }}>{r.tax}</Text>
            <Text style={{ width: cols.sub, textAlign: "right" }}>{r.subtotal}</Text>
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderTopColor: HAIR, marginTop: 2 }} />

        <View wrap={false} style={{ alignSelf: "flex-end", width: "52%", paddingTop: 6 }}>
          {v.totals.map((t, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: t.strong ? 7 : 4,
                borderTopWidth: t.rule ? 1 : 0,
                borderTopColor: HAIR,
              }}
            >
              <Text style={t.strong ? { fontSize: 11.5, color: "#000000" } : { fontFamily: "Helvetica-Bold" }}>{t.label}</Text>
              <Text style={t.strong ? { fontFamily: "Helvetica-Bold", color: "#000000" } : { color: MUTED }}>{t.value}</Text>
            </View>
          ))}
        </View>

        {v.stamp ? (
          <View wrap={false} style={{ marginTop: 18, paddingVertical: 16, alignItems: "center", backgroundColor: v.stamp.kind === "paid" ? "#f0fdf4" : "#f2f4f7" }}>
            <Text style={{ fontSize: 14, color: "#000000" }}>{v.stamp.title}</Text>
            {v.stamp.sub ? <Text style={s.muted}>{v.stamp.sub}</Text> : null}
          </View>
        ) : null}

        {v.terms.length ? (
          <View wrap={false} style={{ marginTop: 20 }}>
            <Text style={{ ...s.label, marginBottom: 5 }}>Terms &amp; Notes:</Text>
            {v.terms.map((t, i) => (
              <Text key={i} style={{ marginBottom: 6, color: "#000000" }}>
                {t}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
