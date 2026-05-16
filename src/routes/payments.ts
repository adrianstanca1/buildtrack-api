/**
 * Payment routes for BuildTrack.
 * Create payment intents, confirm payments, webhook handler.
 */

import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { createPaymentIntent, getOrCreateCustomer, constructWebhookEvent } from '../utils/stripe.js';

const router = Router();

const createIntentSchema = z.object({
  invoiceId: z.string().uuid(),
});

const confirmSchema = z.object({
  paymentIntentId: z.string().min(1),
});

/**
 * POST /api/payments/create-intent
 * Create a Stripe PaymentIntent for an invoice.
 */
/**
 * @swagger
 * /api/payments/create-intent:
 *   post:
 *     summary: Create Payments create intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 */


router.post('/create-intent', authenticateToken, validate(createIntentSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { invoiceId } = req.body;

    // Verify invoice ownership
    const invoiceRes = await query(
      `SELECT i.*, p.user_id as project_owner_id, u.email, u.first_name, u.last_name
       FROM invoices i
       JOIN projects p ON i.project_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE i.id = $1`,
      [invoiceId]
    );

    if (invoiceRes.rows.length === 0) {
      return errorResponse(res, 'Invoice not found', 'NOT_FOUND', 404);
    }

    const invoice = invoiceRes.rows[0];
    if (invoice.project_owner_id !== userId) {
      return errorResponse(res, 'Not authorised', 'FORBIDDEN', 403);
    }

    const amount = parseFloat(invoice.amount) || 0;
    const currency = invoice.currency || 'gbp';

    const customerId = await getOrCreateCustomer(
      userId,
      invoice.email,
      `${invoice.first_name || ''} ${invoice.last_name || ''}`.trim()
    );

    const intent = await createPaymentIntent(amount, currency, invoiceId, customerId || undefined);

    if (!intent) {
      return errorResponse(res, 'Payment service unavailable', 'SERVICE_UNAVAILABLE', 503);
    }

    successResponse(res, {
      clientSecret: intent.clientSecret,
      paymentIntentId: intent.paymentIntentId,
      amount,
      currency,
    });
  } catch (err: any) {
    console.error('[Payments] create-intent error:', err);
    errorResponse(res, 'Failed to create payment intent', 'INTERNAL_ERROR', 500);
  }
});

/**
 * POST /api/payments/confirm
 * Confirm a payment after client-side completion.
 */
router.post('/confirm', authenticateToken, validate(confirmSchema), async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const { stripe } = await import('../utils/stripe.js');
    if (!stripe) {
      return errorResponse(res, 'Payment service unavailable', 'SERVICE_UNAVAILABLE', 503);
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (pi.status === 'succeeded') {
      // Update invoice status
      await query(
        `UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1`,
        [pi.metadata?.invoice_id]
      );

      successResponse(res, { status: 'paid', paymentIntentId });
    } else {
      successResponse(res, { status: pi.status, paymentIntentId });
    }
  } catch (err: any) {
    console.error('[Payments] confirm error:', err);
    errorResponse(res, 'Failed to confirm payment', 'INTERNAL_ERROR', 500);
  }
});

/**
 * POST /api/payments/webhook
 * Stripe webhook handler.
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !secret) {
      return res.status(400).send('Missing signature or secret');
    }

    const event = await constructWebhookEvent(req.body, signature, secret);
    if (!event) {
      return res.status(400).send('Invalid signature');
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as any;
        const invoiceId = pi.metadata?.invoice_id;
        if (invoiceId) {
          await query(
            `UPDATE invoices SET status = 'paid', paid_at = NOW(), stripe_payment_intent_id = $1 WHERE id = $2`,
            [pi.id, invoiceId]
          );
          console.log(`[Webhook] Invoice ${invoiceId} marked as paid`);
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as any;
        const invoiceId = pi.metadata?.invoice_id;
        if (invoiceId) {
          await query(
            `UPDATE invoices SET status = 'overdue', stripe_payment_intent_id = $1 WHERE id = $2`,
            [pi.id, invoiceId]
          );
          console.log(`[Webhook] Invoice ${invoiceId} payment failed`);
        }
        break;
      }
      default:
        console.log(`[Webhook] Unhandled event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('[Payments] webhook error:', err);
    res.status(500).send('Webhook error');
  }
});

export { router as paymentsRouter };
