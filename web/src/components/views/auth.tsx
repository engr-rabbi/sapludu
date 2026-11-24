/**
 * Sapludu — sign-in view. Google Identity Services issues a signed ID token in the browser; the Apps Script
 * backend verifies it with Google and creates / loads the player account. No passwords exist in this app.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { isBackendConfigured } from "@/lib/config";
import { renderGoogleButton } from "@/lib/google";
import { ApiError } from "@/lib/api";
import { usePwaStore } from "@/lib/pwa";
import { Loader2, ShieldCheck, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AuthView() {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const authMode = useUiStore((s) => s.authMode);
  const setAuthMode = useUiStore((s) => s.setAuthMode);
  const language = useUiStore((s) => s.language);
  const postAuthView = useUiStore((s) => s.postAuthView);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const notice = useAuthStore((s) => s.notice);
  const clearNotice = useAuthStore((s) => s.clearNotice);

  const btnRef = useRef<HTMLDivElement>(null);
  const online = usePwaStore((s) => s.online);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errText = useCallback(
    (e: unknown): string => {
      const code = e instanceof ApiError ? e.code : "";
      switch (code) {
        case "ACCOUNT_SUSPENDED":
          return t("auth.err.suspended");
        case "AUTH_DOMAIN_NOT_ALLOWED":
          return t("auth.err.domain");
        case "OFFLINE":
          return t("auth.err.offline");
        case "NETWORK":
        case "TIMEOUT":
        case "BUSY":
        case "AUTH_UNAVAILABLE":
        case "BAD_RESPONSE":
          return t("auth.err.unavailable");
        default:
          return e instanceof ApiError && e.message ? e.message : t("auth.err.generic");
      }
    },
    [t],
  );

  const onCredential = useCallback(
    async (idToken: string) => {
      setBusy(true);
      setError(null);
      try {
        const { isNew } = await loginWithGoogle(idToken);
        sound.play("win");
        toast.success(isNew ? t("auth.welcomeNew") : t("auth.success.loggedIn"));
        const next = useUiStore.getState().postAuthView ?? "dashboard";
        useUiStore.getState().setPostAuthView(null);
        navigate(next);
      } catch (e) {
        setError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [loginWithGoogle, navigate, t, errText],
  );

  useEffect(() => {
    if (!isBackendConfigured || !btnRef.current) return;
    let cancelled = false;
    renderGoogleButton(btnRef.current, (tok) => void onCredential(tok), { locale: language === "bn" ? "bn" : "en", width: 290 }).catch(() => {
      if (!cancelled) setError(t("auth.google.loadError"));
    });
    return () => {
      cancelled = true;
    };
    // re-render the button when the language changes
  }, [language, onCredential, t]);

  const isLogin = authMode === "login";

  return (
    <div className="mx-auto max-w-md py-4">
      <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 text-sm font-bold" role="tablist">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={authMode === m}
              onClick={() => setAuthMode(m)}
              className={`rounded-lg py-2 transition ${authMode === m ? "bg-white text-emerald-700 shadow" : "text-gray-500"}`}
            >
              {m === "login" ? t("landing.cta.login") : t("landing.cta.register")}
            </button>
          ))}
        </div>

        <h1 className="mb-1 text-2xl font-black text-gray-900">{isLogin ? t("auth.google.title") : t("auth.google.titleNew")}</h1>
        <p className="mb-5 text-sm text-gray-500">{t("auth.google.hint")}</p>

        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button className="text-xs font-bold underline" onClick={clearNotice}>
              OK
            </button>
          </div>
        )}

        {!isBackendConfigured ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("auth.google.notConfigured")}</span>
          </div>
        ) : (
          <div className="flex min-h-[44px] flex-col items-center gap-3">
            {busy ? (
              <div className="flex items-center gap-2 py-2 text-sm font-semibold text-emerald-700" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("auth.working")}
              </div>
            ) : (
              <div ref={btnRef} className="flex justify-center" data-testid="google-button" />
            )}
            {!online && (
              <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800" role="alert">
                {t("auth.err.offline")}
              </p>
            )}
            {error && online && (
              <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <p className="mt-5 flex items-start gap-2 text-xs text-gray-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{t("auth.google.privacy")}</span>
        </p>
        <p className="mt-4 text-center text-xs text-gray-500">{t("auth.guestHint")}</p>
        <Button variant="ghost" className="mt-2 w-full text-emerald-700" onClick={() => navigate(postAuthView ?? "play")}>
          {t("landing.cta.guest")}
        </Button>
      </motion.div>
    </div>
  );
}
