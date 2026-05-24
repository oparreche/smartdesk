'use server';

import { getOrgContext } from '@/src/lib/tenant';
import {
  listUserNotifications,
  markAsRead,
  markAllAsRead,
  type NotificationItem,
} from '@/src/services/notifications';

export async function fetchNotificationsAction(): Promise<{
  items: NotificationItem[];
  unreadCount: number;
}> {
  const ctx = await getOrgContext();
  return listUserNotifications(ctx.organizationId, ctx.userId, 20);
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const ctx = await getOrgContext();
  await markAsRead(ctx.organizationId, ctx.userId, id);
}

export async function markAllReadAction(): Promise<void> {
  const ctx = await getOrgContext();
  await markAllAsRead(ctx.organizationId, ctx.userId);
}
