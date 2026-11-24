import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  deleteNotificationById,
  getNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../db.ts';

const router = Router();

// Protected: Fetch authenticated user's notifications and unread count
router.get('/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const notifications = getNotificationsForUser(userId, 60);
  const unreadCount = getUnreadNotificationCount(userId);
  res.json({ notifications, unreadCount });
});

// Protected: Lightweight unread count endpoint for navbar badge updates
router.get('/notifications/unread-count', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const unreadCount = getUnreadNotificationCount(userId);
  res.json({ unreadCount });
});

// Protected: Mark all notifications as read for the authenticated user
router.patch('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const updatedCount = markAllNotificationsAsRead(userId);
  res.json({ updatedCount, unreadCount: 0 });
});

// Protected: Mark a single notification as read (recipient only)
router.patch('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const notificationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const result = markNotificationAsRead(notificationId, userId);

  if (result === 'not_found') {
    res.status(404).json({ error: 'Notification not found.' });
    return;
  }
  if (result === 'forbidden') {
    res.status(403).json({ error: 'You do not have permission to update this notification.' });
    return;
  }

  const unreadCount = getUnreadNotificationCount(userId);
  res.json({ success: true, unreadCount });
});

// Protected: Delete a notification (recipient only)
router.delete('/notifications/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const notificationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const result = deleteNotificationById(notificationId, userId);

  if (result === 'not_found') {
    res.status(404).json({ error: 'Notification not found.' });
    return;
  }
  if (result === 'forbidden') {
    res.status(403).json({ error: 'You do not have permission to delete this notification.' });
    return;
  }

  const unreadCount = getUnreadNotificationCount(userId);
  res.json({ success: true, unreadCount });
});

export default router;
