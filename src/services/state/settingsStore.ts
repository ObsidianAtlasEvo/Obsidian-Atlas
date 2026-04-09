import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type LanguageLevel = 'expert' | 'intermediate' | 'basic';
export type UITheme = 'obsidian' | 'graphite';
export type AnimationSpeed = 'normal' | 'fast' | 'reduced';

interface SettingsState {
  isAdvancedMode: boolean;
  isCrisisMode: boolean;
  precisionLevel: number;
  languageLevel: LanguageLevel;
  
  // Privacy & Data Sovereignty
  isLocalEncryptionEnabled: boolean;
  isTelemetryEnabled: boolean;
  isMemorySovereigntyEnabled: boolean;
  isDataMinimizationEnabled: boolean;
  
  // System Preferences
  uiTheme: UITheme;
  animationSpeed: AnimationSpeed;
  isNotificationsEnabled: boolean;
  
  // Actions
  setAdvancedMode: (val: boolean) => void;
  setCrisisMode: (val: boolean) => void;
  setPrecisionLevel: (val: number) => void;
  setLanguageLevel: (val: LanguageLevel) => void;
  setLocalEncryption: (val: boolean) => void;
  setTelemetry: (val: boolean) => void;
  setMemorySovereignty: (val: boolean) => void;
  setDataMinimization: (val: boolean) => void;
  setUITheme: (val: UITheme) => void;
  setAnimationSpeed: (val: AnimationSpeed) => void;
  setNotifications: (val: boolean) => void;
}

// Simple XOR-based encryption for "Local Encryption" demo
// In a real app, use SubtleCrypto, but that's async and complex for a persist middleware
const encrypt = (text: string, key: string) => {
  return btoa(
    text.split('').map((char, i) => 
      String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    ).join('')
  );
};

const decrypt = (encoded: string, key: string) => {
  try {
    const text = atob(encoded);
    return text.split('').map((char, i) => 
      String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    ).join('');
  } catch (e) {
    return encoded;
  }
};

const ENCRYPTION_KEY = 'atlas-sovereignty-key';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isAdvancedMode: false,
      isCrisisMode: false,
      precisionLevel: 0.9,
      languageLevel: 'expert',
      
      isLocalEncryptionEnabled: false,
      isTelemetryEnabled: true,
      isMemorySovereigntyEnabled: false,
      isDataMinimizationEnabled: false,
      
      uiTheme: 'obsidian',
      animationSpeed: 'normal',
      isNotificationsEnabled: true,
      
      setAdvancedMode: (val) => {
        console.log(`[SYSTEM]: isAdvancedMode updated to ${val}`);
        set({ isAdvancedMode: val });
      },
      setCrisisMode: (val) => {
        console.log(`[SYSTEM]: isCrisisMode updated to ${val}`);
        set({ isCrisisMode: val });
      },
      setPrecisionLevel: (val) => {
        console.log(`[SYSTEM]: precisionLevel updated to ${val}`);
        set({ precisionLevel: val });
      },
      setLanguageLevel: (val) => {
        console.log(`[SYSTEM]: languageLevel updated to ${val}`);
        set({ languageLevel: val });
      },
      setLocalEncryption: (val) => {
        console.log(`[SYSTEM]: isLocalEncryptionEnabled updated to ${val}`);
        set({ isLocalEncryptionEnabled: val });
      },
      setTelemetry: (val) => {
        console.log(`[SYSTEM]: isTelemetryEnabled updated to ${val}`);
        set({ isTelemetryEnabled: val });
      },
      setMemorySovereignty: (val) => {
        console.log(`[SYSTEM]: isMemorySovereigntyEnabled updated to ${val}`);
        set({ isMemorySovereigntyEnabled: val });
      },
      setDataMinimization: (val) => {
        console.log(`[SYSTEM]: isDataMinimizationEnabled updated to ${val}`);
        set({ isDataMinimizationEnabled: val });
      },
      setUITheme: (val) => {
        console.log(`[SYSTEM]: uiTheme updated to ${val}`);
        set({ uiTheme: val });
      },
      setAnimationSpeed: (val) => {
        console.log(`[SYSTEM]: animationSpeed updated to ${val}`);
        set({ animationSpeed: val });
      },
      setNotifications: (val) => {
        console.log(`[SYSTEM]: isNotificationsEnabled updated to ${val}`);
        set({ isNotificationsEnabled: val });
      },
    }),
    {
      name: 'atlas-settings',
      storage: {
        getItem: (name) => {
          const val = localStorage.getItem(name);
          if (!val) return null;
          
          // Check if it's encrypted (simple check)
          try {
            const parsed = JSON.parse(val);
            if (parsed.state.isLocalEncryptionEnabled) {
              // The value itself might be encrypted or the state says it should be
              // We need to handle the case where we just toggled it on
            }
            return parsed;
          } catch (e) {
            // If it's not JSON, it might be encrypted
            const decrypted = decrypt(val, ENCRYPTION_KEY);
            try {
              return JSON.parse(decrypted);
            } catch (e2) {
              return null;
            }
          }
        },
        setItem: (name, value) => {
          const stringified = JSON.stringify(value);
          const state = value.state as any;
          
          if (state.isLocalEncryptionEnabled) {
            localStorage.setItem(name, encrypt(stringified, ENCRYPTION_KEY));
          } else {
            localStorage.setItem(name, stringified);
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
