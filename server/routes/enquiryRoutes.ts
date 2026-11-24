import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  createEnquiry,
  createNotification,
  findUserById,
  getEnquiriesForCustomer,
  getEnquiriesForProvider,
  getEnquiryById,
  getRawEnquiryById,
  logSecurityEvent,
  updateEnquiryStatus,
  type EnquiryStatus,
} from '../db.ts';
import { createRateLimiter, getClientIp } from '../rateLimiter.ts';

const router = Router();

const enquiryCreateLimiter = createRateLimiter({
  namespace: 'enquiry-create',
  maxRequests: 15,
  windowMs: 15 * 60 * 1000,
  keyBy: 'user',
  message: 'Too many service enquiries sent recently. Please wait before sending another.',
});

const ALLOWED_STATUS_VALUES = new Set<EnquiryStatus>([
  'Pending',
  'Accepted',
  'Declined',
  'Completed',
  'Cancelled',
]);

// Protected: Submit a new service enquiry from the authenticated customer to a provider
router.post('/enquiries', requireAuth, enquiryCreateLimiter, (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.authUserId;
  if (!customerId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const body = req.body ?? {};
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
  const serviceRequested =
    typeof body.serviceRequested === 'string' ? body.serviceRequested.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const customerLocation =
    typeof body.customerLocation === 'string' ? body.customerLocation.trim() : '';
  const preferredDate =
    typeof body.preferredDate === 'string' ? body.preferredDate.trim().slice(0, 60) : '';
  const additionalInfo =
    typeof body.additionalInfo === 'string' ? body.additionalInfo.trim().slice(0, 800) : '';

  if (!providerId || providerId.length > 64) {
    res.status(400).json({ error: 'Invalid service provider identifier.' });
    return;
  }

  if (providerId === customerId) {
    res.status(400).json({ error: 'You cannot send a service enquiry to yourself.' });
    return;
  }

  const customer = findUserById(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Your user account could not be found.' });
    return;
  }

  const provider = findUserById(providerId);
  if (!provider) {
    res.status(404).json({ error: 'Service provider not found.' });
    return;
  }

  if (serviceRequested.length < 2 || serviceRequested.length > 120) {
    res.status(400).json({ error: 'Please specify the service required (2–120 characters).' });
    return;
  }

  if (description.length < 5 || description.length > 1500) {
    res.status(400).json({
      error: 'Please describe the work needed (between 5 and 1500 characters).',
    });
    return;
  }

  if (customerLocation.length < 2 || customerLocation.length > 120) {
    res.status(400).json({ error: 'Please enter your location (2–120 characters).' });
    return;
  }

  const now = new Date().toISOString();
  const enquiry = createEnquiry({
    id: crypto.randomUUID(),
    customerId,
    providerId,
    serviceRequested,
    description,
    customerLocation,
    preferredDate,
    additionalInfo,
    createdAt: now,
  });

  createNotification({
    id: crypto.randomUUID(),
    recipientUserId: providerId,
    actorUserId: customerId,
    type: 'enquiry_received',
    relatedEnquiryId: enquiry.id,
    message: `${customer.full_name} sent you an enquiry for ${serviceRequested}.`,
    createdAt: now,
  });

  res.status(201).json({ enquiry });
});

// Protected: List enquiries for the authenticated user (both received and sent)
router.get('/enquiries', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const received = getEnquiriesForProvider(userId);
  const sent = getEnquiriesForCustomer(userId);
  res.json({ received, sent });
});

// Protected: View a single enquiry (strictly visible only to participating customer or provider)
router.get('/enquiries/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const enquiryId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const enquiry = getEnquiryById(enquiryId);
  if (!enquiry) {
    res.status(404).json({ error: 'Enquiry not found.' });
    return;
  }

  if (enquiry.customerId !== userId && enquiry.providerId !== userId) {
    logSecurityEvent({
      eventType: 'unauthorized_access_attempt',
      userId,
      ipAddress: getClientIp(req),
      metadata: { action: 'view_enquiry', targetId: enquiryId },
    });
    res.status(403).json({ error: 'You do not have permission to view this enquiry.' });
    return;
  }

  res.json({ enquiry });
});

// Protected: Update enquiry status with strict ownership & state-machine enforcement
router.patch('/enquiries/:id/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const enquiryId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const existing = getRawEnquiryById(enquiryId);
  if (!existing) {
    res.status(404).json({ error: 'Enquiry not found.' });
    return;
  }

  const isProvider = existing.provider_id === userId;
  const isCustomer = existing.customer_id === userId;
  if (!isProvider && !isCustomer) {
    logSecurityEvent({
      eventType: 'unauthorized_access_attempt',
      userId,
      ipAddress: getClientIp(req),
      metadata: { action: 'update_enquiry', targetId: enquiryId },
    });
    res.status(403).json({ error: 'You do not have permission to update this enquiry.' });
    return;
  }

  const nextStatus = typeof req.body?.status === 'string' ? (req.body.status.trim() as EnquiryStatus) : null;
  if (!nextStatus || !ALLOWED_STATUS_VALUES.has(nextStatus)) {
    res.status(400).json({ error: 'Invalid enquiry status requested.' });
    return;
  }

  if (nextStatus === existing.status) {
    res.status(400).json({ error: `Enquiry is already ${existing.status}.` });
    return;
  }

  // Enforce role + transition rules
  if (isProvider) {
    if ((nextStatus === 'Accepted' || nextStatus === 'Declined') && existing.status !== 'Pending') {
      res.status(400).json({ error: 'Only pending enquiries can be accepted or declined.' });
      return;
    }
    if (nextStatus === 'Completed' && existing.status !== 'Accepted') {
      res.status(400).json({ error: 'Only accepted enquiries can be marked as completed.' });
      return;
    }
    if (nextStatus === 'Cancelled' || nextStatus === 'Pending') {
      res.status(403).json({ error: 'Only the customer can cancel a pending enquiry.' });
      return;
    }
  } else if (isCustomer) {
    if (nextStatus !== 'Cancelled' || existing.status !== 'Pending') {
      res.status(403).json({
        error: 'Customers can only cancel their own pending enquiries.',
      });
      return;
    }
  }

  const now = new Date().toISOString();
  const updated = updateEnquiryStatus(enquiryId, nextStatus, now);
  if (!updated) {
    res.status(404).json({ error: 'Enquiry not found.' });
    return;
  }

  const actor = findUserById(userId);
  const actorName = actor?.full_name ?? 'A LocalPro user';

  if (nextStatus === 'Accepted') {
    createNotification({
      id: crypto.randomUUID(),
      recipientUserId: existing.customer_id,
      actorUserId: userId,
      type: 'enquiry_accepted',
      relatedEnquiryId: enquiryId,
      message: `${actorName} accepted your enquiry for ${existing.service_requested}.`,
      createdAt: now,
    });
  } else if (nextStatus === 'Declined') {
    createNotification({
      id: crypto.randomUUID(),
      recipientUserId: existing.customer_id,
      actorUserId: userId,
      type: 'enquiry_declined',
      relatedEnquiryId: enquiryId,
      message: `${actorName} declined your enquiry for ${existing.service_requested}.`,
      createdAt: now,
    });
  } else if (nextStatus === 'Completed') {
    createNotification({
      id: crypto.randomUUID(),
      recipientUserId: existing.customer_id,
      actorUserId: userId,
      type: 'enquiry_completed',
      relatedEnquiryId: enquiryId,
      message: `${actorName} marked your enquiry for ${existing.service_requested} as completed.`,
      createdAt: now,
    });
  } else if (nextStatus === 'Cancelled') {
    createNotification({
      id: crypto.randomUUID(),
      recipientUserId: existing.provider_id,
      actorUserId: userId,
      type: 'enquiry_cancelled',
      relatedEnquiryId: enquiryId,
      message: `${actorName} cancelled their enquiry for ${existing.service_requested}.`,
      createdAt: now,
    });
  }

  res.json({ enquiry: updated });
});

export default router;
