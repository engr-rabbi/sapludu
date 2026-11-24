/**
 * PWA UI: the "Download for Your Mobile" bar at the very top of the site, the install help dialog,
 * and the offline / update banners.
 */
"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Smartphone, WifiOff, RefreshCw, Share2, MoreVertical, MonitorSmartphone } from "lucide-react";
import { usePwaStore } from "@/lib/pwa";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function useInstallAction() {
  const t = useT();
  const canPrompt = usePwaStore((s) => s.canPrompt);
  const promptInstall = usePwaStore((s) => s.promptInstall);
  const [help, setHelp] = useState(false);
  return {
    help,
    setHelp,
    run: async () => {
      if (canPrompt) {
        const r = await promptInstall();
        if (r === "accepted") toast.success(t("install.installed"));
        return;
      }
      setHelp(true); // browsers without a prompt API (iOS Safari, Firefox, already dismissed…)
    },
  };
}

function InstallHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const platform = usePwaStore((s) => s.platform);
  const secure = typeof window === "undefined" || window.isSecureContext;
  const rows: { id: string; icon: React.ReactNode; text: string; show: boolean }[] = [
    { id: "ios", icon: <Share2 className="h-5 w-5" />, text: t("install.ios"), show: platform === "ios" },
    { id: "android", icon: <MoreVertical className="h-5 w-5" />, text: t("install.android"), show: platform === "android" || platform === "firefox-android" },
    { id: "fx", icon: <Smartphone className="h-5 w-5" />, text: t("install.firefox"), show: platform === "firefox-android" || platform === "desktop-firefox" },
    { id: "desktop", icon: <MonitorSmartphone className="h-5 w-5" />, text: t("install.desktop"), show: platform === "desktop" },
  ];
  // always show the platform-specific hint first, the others below it for completeness
  const ordered = [...rows.filter((r) => r.show), ...rows.filter((r) => !r.show)];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-emerald-600" /> {t("install.title")}
          </DialogTitle>
          <DialogDescription>{t("install.intro")}</DialogDescription>
        </DialogHeader>
        {!secure && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t("install.needsHttps")}</p>}
        <ul className="space-y-2">
          {ordered.map((r, i) => (
            <li key={r.id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${i === 0 ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-900" : "border-gray-100 text-gray-600"}`}>
              <span className="mt-0.5 shrink-0 text-emerald-600">{r.icon}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** False during static prerender / hydration, true afterwards (install state only exists in the browser). */
function useShowInstall() {
  const installed = usePwaStore((s) => s.installed);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return mounted && !installed;
}

/**
 * Large, high-contrast install button for phones. It lives inside the landing hero, directly above the headline
 * (phones only — tablets and desktops keep the slim top bar). Hidden once the app is installed.
 */
export function InstallHeroButton() {
  const t = useT();
  const show = useShowInstall();
  const install = useInstallAction();
  if (!show) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => void install.run()}
        data-testid="install-hero-button"
        className="group relative mx-auto flex min-h-[58px] w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-left shadow-xl shadow-blue-950/40 ring-2 ring-emerald-300 transition active:scale-[0.98] sm:hidden"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-inner">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-base font-black leading-tight text-emerald-900">{t("install.button")}</span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-400 text-amber-950 motion-safe:animate-pulse">
          <Download className="h-5 w-5" aria-hidden />
        </span>
      </button>
      <InstallHelp open={install.help} onOpenChange={install.setHelp} />
    </>
  );
}

/** Slim top shortcut for tablets and desktops (phones get the large hero button instead). */
export function InstallBar() {
  const t = useT();
  const show = useShowInstall();
  const install = useInstallAction();
  if (!show) return null;
  return (
    <>
      <div className="hidden bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white sm:block" data-testid="install-bar">
        <button
          onClick={() => void install.run()}
          className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2 px-3 py-2 text-sm font-bold transition hover:bg-white/10 active:bg-white/20"
        >
          <Smartphone className="h-4 w-4" aria-hidden />
          <span>{t("install.button")}</span>
          <Download className="h-4 w-4 opacity-80" aria-hidden />
        </button>
      </div>
      <InstallHelp open={install.help} onOpenChange={install.setHelp} />
    </>
  );
}

/** Offline notice and "new version" banner. Online features are never faked while offline. */
export function NetworkBanners() {
  const t = useT();
  const online = usePwaStore((s) => s.online);
  const updateReady = usePwaStore((s) => s.updateReady);
  const applyUpdate = usePwaStore((s) => s.applyUpdate);
  const backFlash = usePwaStore((s) => s.backOnline);

  return (
    <>
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-amber-950">
          <WifiOff className="h-4 w-4 shrink-0" /> {t("net.offline")}
        </div>
      )}
      {online && backFlash && (
        <div role="status" className="bg-emerald-600 px-3 py-1.5 text-center text-xs font-bold text-white">
          {t("net.back")}
        </div>
      )}
      {updateReady && (
        <div role="status" className="flex items-center justify-center gap-3 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">
          <span>{t("net.updateReady")}</span>
          <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={applyUpdate}>
            <RefreshCw className="mr-1 h-3 w-3" /> {t("net.reload")}
          </Button>
        </div>
      )}
    </>
  );
}
