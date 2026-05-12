/**
 * Stripe integration for BuildTrack invoice payments.
 * Create payment intents, handle webhooks.
 */

import Stripe from 'stripe';
import { query } from '../config/database.js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn('[Stripe] STRIPE_SECRET_KEY not set — payments disabled');
}

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2026-04-22.dahlia' }) : null;

export async function createPaymentIntent(
  amount: number,
  currency: string,
  invoiceId: string,
  customerId?: string
): Promise<{ clientSecret: string; paymentIntentId: string } | null> {
  if (!stripe) return null;

  try {
    const params: any = {
      amount: Math.round(amount * 100), // pence/cents
      currency: currency.toLowerCase(),
      metadata: { invoice_id: invoiceId },
      automatic_payment_methods: { enabled: true },
    };

    if (customerId) {
      params.customer = customerId;
    }

    const paymentIntent = await stripe.paymentIntents.create(params);
    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    };
  } catch (err: any) {
    console.error('[Stripe] createPaymentIntent error:', err);
    return null;
  }
}

export async function getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string | null> {
  if (!stripe) return null;

  try {
    // Check existing customer
    const existing = await query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
    const existingId = existing.rows[0]?.stripe_customer_id;
    if (existingId) return existingId;

    const customer = await stripe.customers.create({
      email,
      name: name || email,
      metadata: { buildtrack_user_id: userId },
    });

    await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer.id, userId]);
    return customer.id;
  } catch (err: any) {
    console.error('[Stripe] getOrCreateCustomer error:', err);
    return null;
  }
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<any | null> {
  if (!stripe) return null;
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err: any) {
    console.error('[Stripe] retrievePaymentIntent error:', err);
    return null;
  }
}

export async function constructWebhookEvent(payload: string | Buffer, signature: string, secret: string): Promise<any | null> {
  if (!stripe) return null;
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err: any) {
    console.error('[Stripe] webhook verification error:', err);
    return null;
  }
}
