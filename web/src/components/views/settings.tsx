/**
 * Sapludu — settings view: sound, language, animation speed, vibration, theme.
 */
"use client";

import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useT } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Volume2, Languages, Clapperboard, Vibrate, Sun, Moon, Zap } from "lucide-react";

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3.5 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          {icon}
        </span>
        <span className="text-sm font-bold text-gray-800">{label}</span>
      </div>
      {children}
    </div>
  );
}

export function SettingsView() {
  const t = useT();
  const s = useUiStore();

  // apply side effects
  useEffect(() => {
    sound.setEnabled(s.sound);
  }, [s.sound]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", s.theme === "dark");
  }, [s.theme]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-2">
      <h1 className="text-center text-2xl font-black text-gray-900">{t("settings.title")}</h1>

      <div className="rounded-3xl border border-gray-200 bg-white px-5 py-2 shadow-lg">
        <Row icon={<Volume2 className="h-4 w-4" />} label={t("settings.sound")}>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-400">{s.sound ? t("settings.sound.on") : t("settings.sound.off")}</Label>
            <Switch
              checked={s.sound}
              onCheckedChange={(v) => {
                s.setSound(v);
                if (v) sound.play("click");
              }}
              aria-label="sound"
            />
          </div>
        </Row>

        <Row icon={<Languages className="h-4 w-4" />} label={t("settings.language")}>
          <div className="flex gap-1.5">
            {(["en", "bn"] as const).map((l) => (
              <button
                key={l}
                onClick={() => s.setLanguage(l)}
                className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
                  s.language === l
                    ? "bg-emerald-600 text-white shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {l === "en" ? "English" : "বাংলা"}
              </button>
            ))}
          </div>
        </Row>

        <Row icon={<Clapperboard className="h-4 w-4" />} label={t("settings.animation")}>
          <div className="flex gap-1.5">
            {(["normal", "fast", "reduced"] as const).map((a) => (
              <button
                key={a}
                onClick={() => s.setAnimation(a)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  s.animation === a
                    ? "bg-emerald-600 text-white shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t(`settings.animation.${a}` as never)}
              </button>
            ))}
          </div>
        </Row>

        <Row icon={<Vibrate className="h-4 w-4" />} label={t("settings.vibration")}>
          <Switch checked={s.vibration} onCheckedChange={s.setVibration} aria-label="vibration" />
        </Row>

        <Row icon={s.theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} label={t("settings.theme")}>
          <div className="flex gap-1.5">
            {(["light", "dark"] as const).map((th) => (
              <button
                key={th}
                onClick={() => s.setTheme(th)}
                className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${
                  s.theme === th
                    ? "bg-emerald-600 text-white shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {th === "light" ? t("settings.theme.light") : t("settings.theme.dark")}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-400">
        <Zap className="h-3.5 w-3.5" /> Sapludu respects reduced-motion preferences automatically.
      </p>
    </div>
  );
}
