import { useEffect, useState } from 'react';
import type { InstallPromptEvent } from '../types';
import { safeLocalStorageSet } from '../services/storageService';
import { STORAGE_KEYS } from './appContextHelpers';

/**
 *Display and PWA preferences that are local to this device only:
 * data saver, confidentiality (سرية البيانات) and the PWA install prompt.
 * Kept out of AppContext so those concerns can be read and tested on their own.
 */
export function useUiPreferences() {
  // PWA Install Prompt State & Data Saver Mode
  const [installPromptEvent, setInstallPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [canInstallPwa, setCanInstallPwa] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [dataSaverMode, setDataSaverMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dream_dist_data_saver');
    return saved === 'true';
  });

  // Privacy & Confidentiality Mode (سرية البيانات)
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.PRIVACY_MODE) === 'true';
    } catch {
      return false;
    }
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEYS.PRIVACY_MODE, String(next));
      } catch {}
      return next;
    });
  };

  const setPrivacyMode = (val: boolean) => {
    setIsPrivacyMode(val);
    try {
      localStorage.setItem(STORAGE_KEYS.PRIVACY_MODE, String(val));
    } catch {}
  };

  const formatConfidentialCurrency = (amount: number | undefined | null): string => {
    if (isPrivacyMode) return '•••••• ج.م';
    return `${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
  };

  const toggleDataSaverMode = () => {
    setDataSaverMode((prev) => {
      const next = !prev;
      safeLocalStorageSet('dream_dist_data_saver', String(next));
      return next;
    });
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as unknown as InstallPromptEvent);
      setCanInstallPwa(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const triggerInstallPrompt = async (): Promise<boolean> => {
    if (installPromptEvent && typeof installPromptEvent.prompt === 'function') {
      try {
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setCanInstallPwa(false);
          setInstallPromptEvent(null);
          return true;
        }
      } catch (err) {
        console.warn('PWA install prompt notice:', err);
        setIsInstallModalOpen(true);
      }
      return false;
    } else {
      setIsInstallModalOpen(true);
      return false;
    }
  };

  return {
    installPromptEvent,
    canInstallPwa,
    isInstallModalOpen,
    setIsInstallModalOpen,
    dataSaverMode,
    setDataSaverMode,
    toggleDataSaverMode,
    isPrivacyMode,
    togglePrivacyMode,
    setPrivacyMode,
    formatConfidentialCurrency,
    triggerInstallPrompt,
  };
}