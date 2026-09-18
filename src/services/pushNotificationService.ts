// Web Push Notifications & Badging Client Service (PWA / Mobile & Desktop)
export interface PushUserProfile {
  id: string;
  name: string;
}

export type PushPermissionStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export interface PushPreferences {
  turnReminders: boolean;
  directInvites: boolean;
  rematches: boolean;
  gameStartAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number; // 0-23 (e.g. 23)
  quietHoursEnd: number; // 0-23 (e.g. 8)
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  turnReminders: true,
  directInvites: true,
  rematches: true,
  gameStartAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: 23,
  quietHoursEnd: 8,
};

export interface PushStatus {
  isSupported: boolean;
  permission: PushPermissionStatus;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribersCount?: number;
  preferences: PushPreferences;
}

type PushStatusListener = (status: PushStatus) => void;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

class PushNotificationService {
  private status: PushStatus = {
    isSupported: false,
    permission: 'unsupported',
    isSubscribed: false,
    isLoading: false,
    subscribersCount: 0,
    preferences: DEFAULT_PUSH_PREFERENCES,
  };
  private listeners: Set<PushStatusListener> = new Set();
  private lastTurnNotifTimestamp: number = 0;

  constructor() {
    this.loadPreferences();
    this.checkInitialStatus();
  }

  private loadPreferences(): void {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('njambo_push_preferences');
      if (saved) {
        this.status.preferences = { ...DEFAULT_PUSH_PREFERENCES, ...JSON.parse(saved) };
      }
    } catch (e) {
      this.status.preferences = DEFAULT_PUSH_PREFERENCES;
    }
  }

  public updatePreferences(newPrefs: Partial<PushPreferences>): void {
    this.status.preferences = { ...this.status.preferences, ...newPrefs };
    try {
      localStorage.setItem('njambo_push_preferences', JSON.stringify(this.status.preferences));
    } catch (e) {}
    this.notifyListeners();
  }

  public getPreferences(): PushPreferences {
    return this.status.preferences;
  }

  public isQuietHoursActive(): boolean {
    if (!this.status.preferences.quietHoursEnabled) return false;
    const currentHour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = this.status.preferences;

    if (quietHoursStart > quietHoursEnd) {
      // Overnight (e.g. 23h to 8h)
      return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
    } else {
      return currentHour >= quietHoursStart && currentHour < quietHoursEnd;
    }
  }

  public async checkInitialStatus(): Promise<PushStatus> {
    if (typeof window === 'undefined') return this.status;

    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!isSupported) {
      this.status = {
        ...this.status,
        isSupported: false,
        permission: 'unsupported',
        isSubscribed: false,
        isLoading: false,
      };
      this.notifyListeners();
      return this.status;
    }

    const permission = (Notification.permission as PushPermissionStatus) || 'default';
    let isSubscribed = false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      isSubscribed = !!sub;
    } catch (err) {
      console.warn('[PushService] Could not check subscription:', err);
    }

    this.status = {
      ...this.status,
      isSupported: true,
      permission,
      isSubscribed,
      isLoading: false,
    };

    this.notifyListeners();
    return this.status;
  }

  public getStatus(): PushStatus {
    return this.status;
  }

  public subscribeStatus(listener: PushStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l({ ...this.status }));
  }

  // App Badging API on mobile home screen / PWA icon
  public async setBadgeCount(count: number): Promise<void> {
    if (typeof navigator === 'undefined') return;
    try {
      if ('setAppBadge' in navigator) {
        if (count > 0) {
          await (navigator as any).setAppBadge(count);
        } else {
          await (navigator as any).clearAppBadge();
        }
      }
    } catch (e) {
      // ignore
    }
  }

  public async clearBadge(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    try {
      if ('clearAppBadge' in navigator) {
        await (navigator as any).clearAppBadge();
      }
    } catch (e) {
      // ignore
    }
  }

  // Local In-Game background notification
  public async triggerLocalGameNotification(options: {
    title: string;
    body: string;
    roomCode?: string;
    tag?: string;
    type?: 'YOUR_TURN' | 'GAME_START' | 'INVITE';
  }): Promise<void> {
    if (this.isQuietHoursActive()) return;

    if (options.type === 'YOUR_TURN' && !this.status.preferences.turnReminders) return;
    if (options.type === 'GAME_START' && !this.status.preferences.gameStartAlerts) return;

    // Avoid spamming your turn notification
    if (options.type === 'YOUR_TURN') {
      const now = Date.now();
      if (now - this.lastTurnNotifTimestamp < 8000) return;
      this.lastTurnNotifTimestamp = now;
    }

    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(options.title, {
          body: options.body,
          icon: '/icon-192.svg',
          badge: '/icon-192.svg',
          tag: options.tag || 'njambo-local-alert',
          data: {
            roomCode: options.roomCode,
            url: options.roomCode ? `/?join=${options.roomCode}` : '/',
          },
          renotify: true,
          ...({ vibrate: [150, 80, 150] } as any),
        });
      }
    } catch (err) {
      console.warn('[PushService] Local notification failed:', err);
    }
  }

  public async enableNotifications(profile: PushUserProfile | { id: string; name: string }): Promise<{ success: boolean; error?: string }> {
    if (!this.status.isSupported) {
      return { success: false, error: 'Les notifications Push ne sont pas supportées par votre navigateur.' };
    }

    this.status.isLoading = true;
    this.notifyListeners();

    try {
      // 1. Request Browser Permission
      const perm = await Notification.requestPermission();
      this.status.permission = perm as PushPermissionStatus;
      if (perm !== 'granted') {
        this.status.isLoading = false;
        this.status.isSubscribed = false;
        this.notifyListeners();
        return {
          success: false,
          error: perm === 'denied'
            ? 'Notifications bloquées dans les paramètres de votre navigateur.'
            : 'Permission refusée.',
        };
      }

      // 2. Fetch server VAPID public key
      const keyRes = await fetch('/api/push/public-key');
      if (!keyRes.ok) throw new Error('Impossible de récupérer la clé VAPID du serveur.');
      const keyData = await keyRes.json();
      const vapidPublicKey = keyData.publicKey;
      if (!vapidPublicKey) throw new Error('Clé VAPID publique introuvable.');

      // 3. Register or get Service Worker
      const reg = await navigator.serviceWorker.ready;

      // 4. Create Push Subscription
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });
      }

      // 5. Save subscription on server
      const subJson = subscription.toJSON();
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          userName: profile.name,
          subscription: subJson,
          userAgent: navigator.userAgent,
        }),
      });

      if (!saveRes.ok) throw new Error('Erreur lors de l’enregistrement de l’abonnement sur le serveur.');

      this.status.isSubscribed = true;
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: true };
    } catch (err: any) {
      console.error('[PushService] Error enabling push:', err);
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: false, error: err?.message || 'Erreur lors de l’activation des notifications.' };
    }
  }

  public async disableNotifications(userId: string): Promise<{ success: boolean; error?: string }> {
    this.status.isLoading = true;
    this.notifyListeners();

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        // Notify server
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, endpoint }),
        }).catch(() => {});
      }

      this.status.isSubscribed = false;
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: true };
    } catch (err: any) {
      console.error('[PushService] Error disabling push:', err);
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: false, error: err?.message || 'Erreur lors de la désactivation.' };
    }
  }

  public async sendTestNotification(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error || 'Échec de l’envoi de la notification test.' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erreur réseau.' };
    }
  }
}

export const pushNotificationService = new PushNotificationService();
