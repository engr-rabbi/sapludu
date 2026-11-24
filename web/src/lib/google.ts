/** Google Identity Services ("Sign in with Google") loader and button renderer. No passwords ever touch this app. */
import { config } from "./config";

interface GsiId {
  initialize(cfg: Record<string, unknown>): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
  disableAutoSelect(): void;
  cancel(): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GsiId } };
  }
}

let loading: Promise<void> | null = null;

export function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("Could not load Google sign-in (blocked or offline)."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function renderGoogleButton(el: HTMLElement, onCredential: (idToken: string) => void, opts: { locale?: string; width?: number } = {}) {
  await loadGsi();
  const id = window.google!.accounts.id;
  id.initialize({
    client_id: config.googleClientId,
    callback: (r: { credential?: string }) => {
      if (r.credential) onCredential(r.credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    itp_support: true,
  });
  el.innerHTML = "";
  id.renderButton(el, {
    type: "standard",
    theme: "filled_blue",
    size: "large",
    text: "continue_with",
    shape: "pill",
    logo_alignment: "left",
    width: opts.width ?? 300,
    locale: opts.locale,
  });
}

export function googleSignOut() {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* ignore */
  }
}
