/**
 * PWA helpers: install prompt capture, installed-state detection, platform detection, service worker registration
 * and online/offline tracking.
 */
"use client";

import { create } from "zustand";
import { asset } from "@/lib/config";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Platform = "ios" | "android" | "firefox-android" | "desktop" | "desktop-firefox";

const INSTALLED_KEY = "sapludu-installed";

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: fullscreen)").matches || nav.standalone === true;
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/Android/i.test(ua)) return /Firefox/i.test(ua) ? "firefox-android" : "android";
  return /Firefox/i.test(ua) ? "desktop-firefox" : "desktop";
}

interface PwaState {
  /** the browser offered a native install prompt */
  canPrompt: boolean;
  installed: boolean;
  online: boolean;
  /** true for a few seconds after the connection returns */
  backOnline: boolean;
  /** a new service worker is installed and waiting */
  updateReady: boolean;
  platform: Platform;
  init: () => void;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  applyUpdate: () => void;
}

let deferred: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let initialised = false;

export const usePwaStore = create<PwaState>()((set) => ({
  canPrompt: false,
  installed: false,
  online: true,
  backOnline: false,
  updateReady: false,
  platform: "desktop",

  init: () => {
    if (initialised || typeof window === "undefined") return;
    initialised = true;
    let flagged = false;
    try {
      flagged = localStorage.getItem(INSTALLED_KEY) === "1";
    } catch {
      /* ignore */
    }
    const standalone = detectStandalone();
    if (standalone) {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    set({ platform: detectPlatform(), installed: standalone || flagged, online: navigator.onLine });

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
      set({ canPrompt: true });
    });
    window.addEventListener("appinstalled", () => {
      deferred = null;
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* ignore */
      }
      set({ installed: true, canPrompt: false });
    });
    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", (e) => {
      if (e.matches) set({ installed: true });
    });
    window.addEventListener("online", () => {
      set({ online: true, backOnline: true });
      setTimeout(() => set({ backOnline: false }), 3000);
    });
    window.addEventListener("offline", () => set({ online: false }));

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const url = asset("/sw.js");
      navigator.serviceWorker
        .register(url, { scope: asset("/") })
        .then((reg) => {
          const watch = (w: ServiceWorker | null) => {
            if (!w) return;
            w.addEventListener("statechange", () => {
              if (w.state === "installed" && navigator.serviceWorker.controller) {
                waitingWorker = w;
                set({ updateReady: true });
              }
            });
          };
          if (reg.waiting && navigator.serviceWorker.controller) {
            waitingWorker = reg.waiting;
            set({ updateReady: true });
          }
          reg.addEventListener("updatefound", () => watch(reg.installing));
          // look for a new version whenever the app is re-opened
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") void reg.update().catch(() => {});
          });
        })
        .catch(() => {
          /* SW unsupported (e.g. insecure context): the site still works */
        });
      // reload only when an EXISTING controller is replaced by an update the user accepted —
      // not on the very first install, when the new worker merely claims the open page
      const hadController = Boolean(navigator.serviceWorker.controller);
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading || !hadController) return;
        reloading = true;
        location.reload();
      });
    }
  },

  promptInstall: async () => {
    if (!deferred) return "unavailable";
    const ev = deferred;
    deferred = null; // a prompt event can only be used once
    set({ canPrompt: false });
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    return outcome;
  },

  applyUpdate: () => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  },
}));
