import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  KatikaCopilotSettings,
  DEFAULT_COPILOT_SETTINGS,
} from '../types/copilotSettings';

const SETTINGS_COLLECTION = 'katika_settings';
const SETTINGS_DOC_ID = 'copilot_config';
const LOCAL_STORAGE_KEY = 'katika_copilot_settings_v1';

let inMemorySettings: KatikaCopilotSettings = loadFromLocalStorage();
const listeners = new Set<(settings: KatikaCopilotSettings) => void>();

function loadFromLocalStorage(): KatikaCopilotSettings {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_COPILOT_SETTINGS,
        ...parsed,
        socialLinks: {
          ...DEFAULT_COPILOT_SETTINGS.socialLinks,
          ...(parsed.socialLinks || {}),
        },
      };
    }
  } catch (e) {
    console.warn('[CopilotSettingsService] Erreur lecture localStorage:', e);
  }
  return { ...DEFAULT_COPILOT_SETTINGS };
}

function saveToLocalStorage(settings: KatikaCopilotSettings): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[CopilotSettingsService] Erreur écriture localStorage:', e);
  }
}

function notifyListeners(settings: KatikaCopilotSettings): void {
  inMemorySettings = settings;
  saveToLocalStorage(settings);
  listeners.forEach((fn) => {
    try {
      fn(settings);
    } catch (e) {
      console.error('[CopilotSettingsService] Erreur listener:', e);
    }
  });
}

// Initialise un abonnement temps-réel avec Firestore si disponible
let firestoreSubscribed = false;

export function initCopilotSettingsSync(): () => void {
  if (firestoreSubscribed) return () => {};
  firestoreSubscribed = true;

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const remoteData = snapshot.data() as Partial<KatikaCopilotSettings>;
          const merged: KatikaCopilotSettings = {
            ...DEFAULT_COPILOT_SETTINGS,
            ...inMemorySettings,
            ...remoteData,
            socialLinks: {
              ...DEFAULT_COPILOT_SETTINGS.socialLinks,
              ...inMemorySettings.socialLinks,
              ...(remoteData.socialLinks || {}),
            },
          };
          notifyListeners(merged);
        } else {
          // Document n'existe pas encore dans Firestore, on sauvegarde les défauts
          setDoc(docRef, inMemorySettings).catch((err) => {
            console.warn('[CopilotSettingsService] Création doc initial échouée:', err);
          });
        }
      },
      (error) => {
        console.warn('[CopilotSettingsService] Synchronisation Firestore dégradée (mode local actif):', error);
      }
    );

    return () => {
      unsubscribe();
      firestoreSubscribed = false;
    };
  } catch (err) {
    console.warn('[CopilotSettingsService] Erreur initialisation Firestore sync:', err);
    return () => {};
  }
}

export const CopilotSettingsService = {
  /**
   * Retourne les paramètres actuels de façon synchrone (depuis la mémoire ou cache local)
   */
  getSettings(): KatikaCopilotSettings {
    return inMemorySettings;
  },

  /**
   * S'abonne aux changements des options du copilote
   */
  subscribe(callback: (settings: KatikaCopilotSettings) => void): () => void {
    listeners.add(callback);
    callback(inMemorySettings);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Sauvegarde les paramètres dans Firestore et le cache local
   */
  async saveSettings(partial: Partial<KatikaCopilotSettings>): Promise<KatikaCopilotSettings> {
    const updated: KatikaCopilotSettings = {
      ...inMemorySettings,
      ...partial,
      socialLinks: {
        ...inMemorySettings.socialLinks,
        ...(partial.socialLinks || {}),
      },
      updatedAt: Date.now(),
    };

    // 1. Notification immédiate de l'interface locale
    notifyListeners(updated);

    // 2. Synchronisation distante dans Firestore
    try {
      const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
      await setDoc(docRef, updated, { merge: true });
    } catch (err) {
      console.warn('[CopilotSettingsService] Sauvegarde Firestore différée ou échouée (sauvegardé en local):', err);
    }

    return updated;
  },

  /**
   * Réinitialise les paramètres aux valeurs d'origine
   */
  async resetToDefaults(): Promise<KatikaCopilotSettings> {
    return await this.saveSettings(DEFAULT_COPILOT_SETTINGS);
  },
};
