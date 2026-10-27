import { ENV } from './config';
import { buildHeaders, type ApiOptions } from './txApi';

export type ServerNotificationKind = 'tx_sent' | 'tx_received' | 'tx_failed';

export interface ServerNotificationItem {
  id: string;
  kind: ServerNotificationKind;
  tx_hash: string;
  data: {
    asset: 'USDC' | 'ETH';
    amount: string;
    counterparty: string;
  };
  created_at: string;
  read: boolean;
}

export interface FetchNotificationsOptions extends ApiOptions {
  backfill?: boolean;
}

export const DEMO_SERVER_NOTIFICATIONS: ServerNotificationItem[] = [
  {
    id: 'demo-srv-notif-1',
    kind: 'tx_received',
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    data: {
      asset: 'ETH',
      amount: '0.02',
      counterparty: 'rina',
    },
    created_at: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'demo-srv-notif-2',
    kind: 'tx_sent',
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    data: {
      asset: 'ETH',
      amount: '0.01',
      counterparty: 'rina',
    },
    created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    read: true,
  },
];

/**
 * Fetch server notifications from Supabase Edge Function tx
 */
export async function fetchNotifications(
  options: FetchNotificationsOptions = {}
): Promise<{ ok: boolean; items: ServerNotificationItem[]; unread: number }> {
  if (options.isDemoMode) {
    const unreadCount = DEMO_SERVER_NOTIFICATIONS.filter((n) => !n.read).length;
    return {
      ok: true,
      items: DEMO_SERVER_NOTIFICATIONS,
      unread: unreadCount,
    };
  }

  if (!ENV.SUPABASE_URL) {
    return { ok: false, items: [], unread: 0 };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'notifications',
        backfill: Boolean(options.backfill),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, items: [], unread: 0 };
    }

    const rawItems: any[] = data.items || data.notifications || [];
    const items: ServerNotificationItem[] = rawItems.map((item) => ({
      id: String(item.id || item.tx_hash || Math.random().toString(36).slice(2)),
      kind: (item.kind as ServerNotificationKind) || 'tx_received',
      tx_hash: item.tx_hash || '',
      data: {
        asset: item.data?.asset || item.asset || 'USDC',
        amount: String(item.data?.amount || item.amount || '0'),
        counterparty: String(item.data?.counterparty || item.counterparty || '').replace(/^@/, ''),
      },
      created_at: item.created_at || new Date().toISOString(),
      read: Boolean(item.read),
    }));

    const unread = typeof data.unread === 'number' ? data.unread : items.filter((i) => !i.read).length;

    return { ok: true, items, unread };
  } catch (_e) {
    return { ok: false, items: [], unread: 0 };
  }
}

/**
 * Mark all server notifications as read
 */
export async function markNotificationsRead(
  options: ApiOptions = {}
): Promise<{ ok: boolean }> {
  if (options.isDemoMode) {
    return { ok: true };
  }

  if (!ENV.SUPABASE_URL) {
    return { ok: false };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'mark_read',
      }),
    });

    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
