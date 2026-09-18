import { CopilotSettingsService } from './copilotSettingsService';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  image?: {
    dataUrl: string;
    name?: string;
    sizeBytes?: number;
  };
  isError?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

export type ChatTone = 'concise' | 'balanced' | 'detailed';
export type ChatStyle = 'direct' | 'pedagogical' | 'strategic';

export interface ChatBotPreferences {
  tone: ChatTone;
  style: ChatStyle;
  model?: string;
  apiKey?: string;
  temperatureMode?: 'analytical' | 'balanced' | 'creative';
  socialLinks?: {
    appUrl?: string;
    whatsappUrl?: string;
    facebookUrl?: string;
    tiktokUrl?: string;
    instagramUrl?: string;
  };
  defaultLinkStrategy?: 'AUTO' | 'APP_ONLY' | 'WHATSAPP_ONLY' | 'BOTH';
  customHashtags?: string[];
}

const PREF_STORAGE_KEY = 'katika_ai_assistant_prefs';
const HISTORY_STORAGE_KEY = 'katika_ai_assistant_history_v1';
const THREADS_STORAGE_KEY = 'katika_ai_assistant_threads_v2';
const ACTIVE_THREAD_ID_KEY = 'katika_ai_assistant_active_thread_id_v2';

export const DEFAULT_PREFERENCES: ChatBotPreferences = {
  tone: 'balanced',
  style: 'pedagogical',
  model: 'gemini-3.8-flash',
  temperatureMode: 'balanced',
};

export const AiAdminChatClient = {
  getPreferences(): ChatBotPreferences {
    const copilotSettings = CopilotSettingsService.getSettings();
    let localPrefs: Partial<ChatBotPreferences> = {};
    try {
      const stored = localStorage.getItem(PREF_STORAGE_KEY);
      if (stored) {
        localPrefs = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[AI Assistant] Error reading preferences:', e);
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...localPrefs,
      model: copilotSettings.geminiModel || localPrefs.model || DEFAULT_PREFERENCES.model,
      apiKey: copilotSettings.geminiApiKey || undefined,
      temperatureMode: copilotSettings.aiTemperatureMode || 'balanced',
      socialLinks: copilotSettings.socialLinks,
      defaultLinkStrategy: copilotSettings.defaultLinkStrategy,
      customHashtags: copilotSettings.customHashtags,
    };
  },

  savePreferences(prefs: ChatBotPreferences): void {
    try {
      localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.warn('[AI Assistant] Error saving preferences:', e);
    }
  },

  // Multi-thread management
  getThreads(): ChatThread[] {
    try {
      const stored = localStorage.getItem(THREADS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatThread[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }

      // Backward compatibility: migrate legacy single history if present
      const legacyHistory = this.getSavedHistory();
      const defaultThread: ChatThread = {
        id: 'thread_default_' + Date.now(),
        title: legacyHistory.length > 0 ? 'Discussion principale' : 'Nouvelle discussion',
        messages: legacyHistory,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPinned: false,
      };

      this.saveThreads([defaultThread]);
      this.setActiveThreadId(defaultThread.id);
      return [defaultThread];
    } catch (e) {
      console.warn('[AI Assistant] Error reading threads:', e);
      return [
        {
          id: 'thread_fallback',
          title: 'Nouvelle discussion',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPinned: false,
        },
      ];
    }
  },

  saveThreads(threads: ChatThread[]): void {
    try {
      localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads));
    } catch (e) {
      console.warn('[AI Assistant] Error saving threads:', e);
    }
  },

  getActiveThreadId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_THREAD_ID_KEY);
    } catch {
      return null;
    }
  },

  setActiveThreadId(threadId: string): void {
    try {
      localStorage.setItem(ACTIVE_THREAD_ID_KEY, threadId);
    } catch (e) {
      console.warn('[AI Assistant] Error setting active thread id:', e);
    }
  },

  getSavedHistory(): ChatMessage[] {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[AI Assistant] Error reading history:', e);
    }
    return [];
  },

  saveHistory(messages: ChatMessage[]): void {
    try {
      // Keep up to 30 most recent messages
      const pruned = messages.slice(-30);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(pruned));
    } catch (e) {
      console.warn('[AI Assistant] Error saving history:', e);
    }
  },

  clearHistory(): void {
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) {
      console.warn('[AI Assistant] Error clearing history:', e);
    }
  },

  cleanClientHistoryItem(content: string): string {
    let text = content || '';
    if (text.includes('```json')) {
      text = text.replace(/```json[\s\S]*?```/g, '[Visuel généré précédemment]');
    }
    text = text.replace(/(\|.*?\|\n){3,}/g, '[Données tabulaires du tour précédent]\n');
    return text.slice(0, 450);
  },

  async sendMessage(params: {
    message: string;
    image?: { data: string; mimeType: string; name?: string };
    history?: ChatMessage[];
    config?: ChatBotPreferences;
    metricsSnapshot?: any;
  }): Promise<string> {
    const formattedHistory = (params.history || [])
      .filter((m) => !m.isError && m.content)
      .slice(-3)
      .map((m) => {
        return {
          role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          text: this.cleanClientHistoryItem(m.content),
        };
      });

    const response = await fetch('/api/katika/ai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-katika-admin-token': 'katika_master_secret_key_2026',
      },
      body: JSON.stringify({
        message: params.message,
        image: params.image,
        history: formattedHistory,
        config: params.config || this.getPreferences(),
        metricsSnapshot: params.metricsSnapshot,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Échec de communication avec le serveur IA.');
    }

    return data.reply;
  },

  /**
   * Real-time streaming response using Server-Sent Events (SSE).
   * Automatically falls back to standard HTTP POST if streaming is interrupted.
   */
  async sendMessageStream(params: {
    message: string;
    image?: { data: string; mimeType: string; name?: string };
    history?: ChatMessage[];
    config?: ChatBotPreferences;
    metricsSnapshot?: any;
    onChunk: (accumulatedText: string, chunk: string) => void;
  }): Promise<string> {
    const formattedHistory = (params.history || [])
      .filter((m) => !m.isError && m.content)
      .slice(-3)
      .map((m) => {
        return {
          role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          text: this.cleanClientHistoryItem(m.content),
        };
      });

    try {
      const response = await fetch('/api/katika/ai-chat-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-katika-admin-token': 'katika_master_secret_key_2026',
        },
        body: JSON.stringify({
          message: params.message,
          image: params.image,
          history: formattedHistory,
          config: params.config || this.getPreferences(),
          metricsSnapshot: params.metricsSnapshot,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: Streaming indisponible`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              accumulated += parsed.text;
              params.onChunk(accumulated, parsed.text);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }

      if (accumulated) {
        return accumulated;
      }
      return await this.sendMessage(params);
    } catch (streamError) {
      console.warn('[AI Assistant Client] Streaming error, fallback to static fetch:', streamError);
      const staticResult = await this.sendMessage(params);
      params.onChunk(staticResult, staticResult);
      return staticResult;
    }
  },
};
