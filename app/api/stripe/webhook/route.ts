import Stripe from "stripe";
import { handleCheckoutCompleted } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "STRIPE_WEBHOOK_SECRET is not set." }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return Response.json({ error: "Missing stripe-signature header." }, { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return Response.json({ error: `Signature verification failed: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const number = handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    return Response.json({ received: true, invoice: number });
  }
  return Response.json({ received: true, ignored: event.type });
}
