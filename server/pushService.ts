import webpush from 'web-push';
import crypto from 'crypto';
import { db } from '../src/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface UserSubscriptionRecord {
  userId: string;
  userName?: string;
  subscription: PushSubscriptionData;
  createdAt: number;
  userAgent?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    type?: 'INVITATION' | 'GAME_START' | 'YOUR_TURN' | 'SYSTEM';
    roomCode?: string;
    inviteId?: string;
    fromUserId?: string;
    fromUserName?: string;
    url?: string;
    [key: string]: any;
  };
}

function getSubscriptionId(userId: string, endpoint: string): string {
  const hash = crypto.createHash('sha256').update(endpoint).digest('hex');
  return `${userId}_${hash.slice(0, 32)}`;
}

class PushService {
  private vapidPublicKey: string = '';
  private vapidPrivateKey: string = '';
  private subscriptions: Map<string, UserSubscriptionRecord[]> = new Map(); // userId -> subscriptions (In-memory fallback cache)

  constructor() {
    this.initVapidKeys();
  }

  private initVapidKeys() {
    // Check if environment variables exist, otherwise generate a consistent key pair
    const envPublic = process.env.VAPID_PUBLIC_KEY;
    const envPrivate = process.env.VAPID_PRIVATE_KEY;

    if (envPublic && envPrivate) {
      this.vapidPublicKey = envPublic;
      this.vapidPrivateKey = envPrivate;
    } else {
      // Generate standard VAPID keys for this server runtime
      const generated = webpush.generateVAPIDKeys();
      this.vapidPublicKey = generated.publicKey;
      this.vapidPrivateKey = generated.privateKey;
    }

    try {
      webpush.setVapidDetails(
        'mailto:support@njambokora.com',
        this.vapidPublicKey,
        this.vapidPrivateKey
      );
      console.log('[PushService] Web Push VAPID configured successfully');
    } catch (err) {
      console.error('[PushService] Failed to set VAPID details:', err);
    }
  }

  public getPublicKey(): string {
    return this.vapidPublicKey;
  }

  public registerSubscription(userId: string, userName: string | undefined, subscription: PushSubscriptionData, userAgent?: string): boolean {
    if (!userId || !subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return false;
    }

    if (db) {
      const docId = getSubscriptionId(userId, subscription.endpoint);
      setDoc(doc(db, 'push_subscriptions', docId), {
        userId,
        userName: userName || 'Anonyme',
        subscription,
        createdAt: Date.now(),
        userAgent: userAgent || '',
      }).then(() => {
        console.log(`[PushService] Saved push subscription to Firestore for user ${userId} (${userName || 'Anonyme'})`);
      }).catch((err: any) => {
        console.error(`[PushService] Failed to save push subscription to Firestore for user ${userId}:`, err);
      });
    }

    // Always mirror to in-memory fallback cache
    const existing = this.subscriptions.get(userId) || [];
    const filtered = existing.filter((s) => s.subscription.endpoint !== subscription.endpoint);
    filtered.push({
      userId,
      userName,
      subscription,
      createdAt: Date.now(),
      userAgent,
    });

    this.subscriptions.set(userId, filtered);
    console.log(`[PushService] Registered push subscription in memory for user ${userId} (${userName || 'Anonyme'}). Total cache: ${filtered.length}`);
    return true;
  }

  public removeSubscription(userId: string, endpoint: string): boolean {
    if (db) {
      const docId = getSubscriptionId(userId, endpoint);
      deleteDoc(doc(db, 'push_subscriptions', docId))
        .then(() => {
          console.log(`[PushService] Deleted push subscription from Firestore for user ${userId}`);
        })
        .catch((err: any) => {
          console.error(`[PushService] Failed to delete push subscription from Firestore:`, err);
        });
    }

    const existing = this.subscriptions.get(userId);
    if (!existing) return false;

    const filtered = existing.filter((s) => s.subscription.endpoint !== endpoint);
    if (filtered.length === 0) {
      this.subscriptions.delete(userId);
    } else {
      this.subscriptions.set(userId, filtered);
    }
    return true;
  }

  public async sendNotificationToUser(userId: string, payload: PushPayload): Promise<{ success: number; failed: number }> {
    let userSubs: UserSubscriptionRecord[] = [];

    if (db) {
      try {
        const q = query(collection(db, 'push_subscriptions'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        userSubs = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            userId: data.userId,
            userName: data.userName,
            subscription: data.subscription,
            createdAt: data.createdAt,
            userAgent: data.userAgent,
          } as UserSubscriptionRecord;
        });
        console.log(`[PushService] Loaded ${userSubs.length} push subscriptions from Firestore for user ${userId}`);
      } catch (err) {
        console.error(`[PushService] Failed to load push subscriptions from Firestore for user ${userId}, falling back to memory:`, err);
        userSubs = this.subscriptions.get(userId) || [];
      }
    } else {
      userSubs = this.subscriptions.get(userId) || [];
    }

    if (userSubs.length === 0) {
      return { success: 0, failed: 0 };
    }

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192.svg',
      badge: payload.badge || '/icon-192.svg',
      tag: payload.tag || 'njambo-kora-notification',
      data: payload.data || {},
    });

    let successCount = 0;
    let failedCount = 0;
    const invalidEndpoints: string[] = [];

    const sendPromises = userSubs.map(async (record) => {
      try {
        await webpush.sendNotification(record.subscription as any, payloadString, {
          TTL: 60 * 60, // 1 hour
          urgency: 'high',
        });
        successCount++;
      } catch (err: any) {
        failedCount++;
        console.warn(`[PushService] Failed push to ${userId}:`, err?.statusCode || err?.message);
        // 404 or 410 means expired subscription
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          invalidEndpoints.push(record.subscription.endpoint);
        }
      }
    });

    await Promise.all(sendPromises);

    // Clean up expired subscriptions
    if (invalidEndpoints.length > 0) {
      if (db) {
        for (const endpoint of invalidEndpoints) {
          const docId = getSubscriptionId(userId, endpoint);
          deleteDoc(doc(db, 'push_subscriptions', docId)).catch(() => {});
        }
      }

      // Sync memory fallback cache
      const memorySubs = this.subscriptions.get(userId);
      if (memorySubs) {
        const remaining = memorySubs.filter((s) => !invalidEndpoints.includes(s.subscription.endpoint));
        if (remaining.length === 0) {
          this.subscriptions.delete(userId);
        } else {
          this.subscriptions.set(userId, remaining);
        }
      }
    }

    return { success: successCount, failed: failedCount };
  }

  public async broadcastToAll(payload: PushPayload): Promise<{ success: number; failed: number }> {
    let totalSuccess = 0;
    let totalFailed = 0;

    if (db) {
      try {
        const snapshot = await getDocs(collection(db, 'push_subscriptions'));
        const userSubsMap = new Map<string, UserSubscriptionRecord[]>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const record = {
            userId: data.userId,
            userName: data.userName,
            subscription: data.subscription,
            createdAt: data.createdAt,
            userAgent: data.userAgent,
          } as UserSubscriptionRecord;
          const list = userSubsMap.get(record.userId) || [];
          list.push(record);
          userSubsMap.set(record.userId, list);
        });

        for (const userId of userSubsMap.keys()) {
          const res = await this.sendNotificationToUser(userId, payload);
          totalSuccess += res.success;
          totalFailed += res.failed;
        }
        return { success: totalSuccess, failed: totalFailed };
      } catch (err) {
        console.error('[PushService] Broadcast failed from Firestore, falling back to memory:', err);
      }
    }

    // Memory cache fallback
    for (const userId of this.subscriptions.keys()) {
      const res = await this.sendNotificationToUser(userId, payload);
      totalSuccess += res.success;
      totalFailed += res.failed;
    }
    return { success: totalSuccess, failed: totalFailed };
  }

  public getSubscribersCount(): number {
    let count = 0;
    for (const subs of this.subscriptions.values()) {
      count += subs.length;
    }
    return count;
  }
}

export const pushService = new PushService();
