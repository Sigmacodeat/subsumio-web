/**
 * Notification Bell — P1-NOTIF-002
 * ==================================
 * Notification-Bell-State-Management mit Realtime-Polling,
 * SSE-Support, Push-Bridge-Integration und Accessibility.
 *
 * Architektur:
 *   1. NotificationBellManager — State-Management + Polling + SSE
 *   2. PushBridge — Web-Push-API Integration (VAPID, Service Worker)
 *   3. SSEConnectionManager — Server-Sent Events für Realtime-Updates
 *   4. Accessibility — ARIA-Labels, Icon-States, Keyboard-Navigation
 *
 * Kopplung:
 *   - notification-model.ts → NotificationStore (Datenquelle)
 *   - whatsapp-event-bus.ts → NotificationEventBus (Event-Quelle)
 *   - Dashboard Topbar → NotificationBellManager (UI-Binding)
 */

import type { NotificationRecord, NotificationStore, NotificationType, NotificationPriority } from "@/lib/notification-model";

// ── Bell State ────────────────────────────────────────────────────────

export interface NotificationBellState {
  unread_count: number;
  notifications: NotificationRecord[];
  loading: boolean;
  error: string | null;
  last_fetch_at: string | null;
  polling_active: boolean;
  sse_connected: boolean;
  push_subscribed: boolean;
  dropdown_open: boolean;
}

export interface NotificationBellConfig {
  polling_interval_ms: number;
  max_notifications: number;
  auto_mark_seen_on_open: boolean;
  push_bridge_enabled: boolean;
  sse_enabled: boolean;
  sse_url: string | null;
  vapid_key: string | null;
}

export const DEFAULT_BELL_CONFIG: NotificationBellConfig = {
  polling_interval_ms: 30_000,
  max_notifications: 20,
  auto_mark_seen_on_open: false,
  push_bridge_enabled: true,
  sse_enabled: true,
  sse_url: null,
  vapid_key: null,
};

// ── Bell Manager ──────────────────────────────────────────────────────

export class NotificationBellManager {
  private state: NotificationBellState;
  private config: NotificationBellConfig;
  private store: NotificationStore;
  private userId: string;
  private brainId: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sseManager: SSEConnectionManager | null = null;
  private listeners: Set<(state: NotificationBellState) => void> = new Set();

  constructor(
    store: NotificationStore,
    userId: string,
    brainId: string,
    config?: Partial<NotificationBellConfig>,
  ) {
    this.store = store;
    this.userId = userId;
    this.brainId = brainId;
    this.config = { ...DEFAULT_BELL_CONFIG, ...config };
    this.state = {
      unread_count: 0,
      notifications: [],
      loading: false,
      error: null,
      last_fetch_at: null,
      polling_active: false,
      sse_connected: false,
      push_subscribed: false,
      dropdown_open: false,
    };
  }

  getState(): NotificationBellState {
    return { ...this.state };
  }

  subscribe(listener: (state: NotificationBellState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(updates: Partial<NotificationBellState>): void {
    this.state = { ...this.state, ...updates };
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  async refresh(): Promise<void> {
    this.setState({ loading: true, error: null });
    try {
      const [notifications, unreadCount] = await Promise.all([
        this.store.list({
          user_id: this.userId,
          brain_id: this.brainId,
          limit: this.config.max_notifications,
        }),
        this.store.getUnreadCount(this.userId, this.brainId),
      ]);
      this.setState({
        notifications,
        unread_count: unreadCount,
        loading: false,
        last_fetch_at: new Date().toISOString(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  start(): void {
    if (this.state.polling_active) return;
    this.setState({ polling_active: true });
    this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), this.config.polling_interval_ms);

    if (this.config.sse_enabled && this.config.sse_url) {
      this.sseManager = new SSEConnectionManager(this.config.sse_url);
      this.sseManager.connect();
      this.sseManager.onNotification(() => this.refresh());
      this.setState({ sse_connected: true });
    }
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.sseManager) {
      this.sseManager.disconnect();
      this.sseManager = null;
    }
    this.setState({ polling_active: false, sse_connected: false });
  }

  openDropdown(): void {
    this.setState({ dropdown_open: true });
    if (this.config.auto_mark_seen_on_open) {
      this.markAllRead();
    }
  }

  closeDropdown(): void {
    this.setState({ dropdown_open: false });
  }

  toggleDropdown(): void {
    if (this.state.dropdown_open) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  async markRead(id: string): Promise<void> {
    await this.store.markRead(id);
    await this.refresh();
  }

  async markAllRead(): Promise<void> {
    await this.store.markAllRead(this.userId, this.brainId);
    await this.refresh();
  }

  async archive(id: string): Promise<void> {
    await this.store.archive(id);
    await this.refresh();
  }

  async enablePush(subscription: PushSubscription): Promise<void> {
    this.setState({ push_subscribed: true });
  }

  async disablePush(): Promise<void> {
    this.setState({ push_subscribed: false });
  }

  getUnreadByType(): Record<NotificationType, number> {
    const counts: Partial<Record<NotificationType, number>> = {};
    for (const n of this.state.notifications) {
      if (n.read_at === null && !n.archived) {
        counts[n.type] = (counts[n.type] ?? 0) + 1;
      }
    }
    return counts as Record<NotificationType, number>;
  }

  getUnreadByPriority(): Record<NotificationPriority, number> {
    const counts: Partial<Record<NotificationPriority, number>> = {};
    for (const n of this.state.notifications) {
      if (n.read_at === null && !n.archived) {
        counts[n.priority] = (counts[n.priority] ?? 0) + 1;
      }
    }
    return counts as Record<NotificationPriority, number>;
  }

  hasUrgentUnread(): boolean {
    return this.state.notifications.some(
      (n) => n.priority === "urgent" && n.read_at === null && !n.archived,
    );
  }
}

// ── SSE Connection Manager ────────────────────────────────────────────

export class SSEConnectionManager {
  private url: string;
  private eventSource: EventSource | null = null;
  private listeners: Set<(notification: NotificationRecord) => void> = new Set();
  private connected = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.connected) return;
    try {
      this.eventSource = new EventSource(this.url);
      this.eventSource.onopen = () => { this.connected = true; };
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as NotificationRecord;
          for (const listener of this.listeners) {
            listener(data);
          }
        } catch {
          // Ignore malformed data
        }
      };
      this.eventSource.onerror = () => {
        this.connected = false;
      };
    } catch {
      this.connected = false;
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }

  onNotification(listener: (notification: NotificationRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ── Push Bridge ───────────────────────────────────────────────────────

export interface PushBridgeConfig {
  vapid_key: string;
  service_worker_path: string;
  subscription_endpoint: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expiration_time: number | null;
}

export async function createPushSubscription(
  config: PushBridgeConfig,
): Promise<PushSubscriptionData | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register(config.service_worker_path);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: config.vapid_key,
    });
    return {
      endpoint: sub.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh") ?? new ArrayBuffer(0)))),
        auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth") ?? new ArrayBuffer(0)))),
      },
      expiration_time: sub.expirationTime,
    };
  } catch {
    return null;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export function buildPushPayload(notification: NotificationRecord): PushPayload {
  const actions: Array<{ action: string; title: string }> = [];
  if (notification.type === "approval_request") {
    actions.push({ action: "approve", title: "Freigeben" });
    actions.push({ action: "reject", title: "Ablehnen" });
  }

  return {
    title: notification.title,
    body: notification.body,
    tag: notification.id,
    data: {
      notification_id: notification.id,
      type: notification.type,
      case_slug: notification.case_slug,
      action_slug: notification.action_slug,
    },
    actions: actions.length > 0 ? actions : undefined,
  };
}

// ── Accessibility ─────────────────────────────────────────────────────

export function buildBellAriaLabel(unreadCount: number, hasUrgent: boolean): string {
  if (unreadCount === 0) return "Benachrichtigungen — keine ungelesenen";
  if (hasUrgent) return `Benachrichtigungen — ${unreadCount} ungelesen, dringende Benachrichtigung vorhanden`;
  return `Benachrichtigungen — ${unreadCount} ungelesen`;
}

export type BellIconState = "none" | "unread" | "urgent";

export function getBellIconState(unreadCount: number, hasUrgent: boolean): BellIconState {
  if (unreadCount === 0) return "none";
  if (hasUrgent) return "urgent";
  return "unread";
}

export function getBellBadgeColor(state: BellIconState): string {
  switch (state) {
    case "urgent": return "bg-red-500 text-white";
    case "unread": return "bg-blue-500 text-white";
    default: return "";
  }
}

export function getBellBadgeText(unreadCount: number): string {
  if (unreadCount === 0) return "";
  if (unreadCount > 99) return "99+";
  return String(unreadCount);
}

// ── Keyboard Navigation ───────────────────────────────────────────────

export type KeyboardAction = "open" | "close" | "next" | "previous" | "mark_read" | "mark_all_read" | "archive";

export function handleBellKeyboard(
  event: KeyboardEvent,
  dropdownOpen: boolean,
  notificationCount: number,
  selectedIndex: number,
): { action: KeyboardAction; newSelectedIndex: number } | null {
  if (!dropdownOpen) {
    if (event.key === "Enter" || event.key === " ") {
      return { action: "open", newSelectedIndex: 0 };
    }
    if (event.key === "Escape") {
      return { action: "close", newSelectedIndex: -1 };
    }
    return null;
  }

  switch (event.key) {
    case "Escape":
      return { action: "close", newSelectedIndex: -1 };
    case "ArrowDown":
      return { action: "next", newSelectedIndex: Math.min(selectedIndex + 1, notificationCount - 1) };
    case "ArrowUp":
      return { action: "previous", newSelectedIndex: Math.max(selectedIndex - 1, 0) };
    case "r":
      return { action: "mark_read", newSelectedIndex: selectedIndex };
    case "R":
      return { action: "mark_all_read", newSelectedIndex: selectedIndex };
    case "a":
      return { action: "archive", newSelectedIndex: selectedIndex };
    default:
      return null;
  }
}
