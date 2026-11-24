/**
 * Sapludu — landing view.
 *
 * Game-first homepage: the first screen screams "Snakes & Ladders" with an
 * authentic illustrated board (real game snakes/ladders renderers), colorful
 * pawns, tumbling dice, and clear play actions. Fully responsive, vibrant
 * palette (rich blue, emerald, yellow, orange, coral, purple).
 */
"use client";

import { motion } from "framer-motion";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/views/app-shell";
import { HeroBoard } from "@/components/game/hero-board";
import {
  Play,
  Users,
  Bot,
  Globe2,
  Trophy,
  ArrowRight,
  Dice5,
  TrendingUp,
  Flag,
  Sparkles,
  ShieldCheck,
  Wifi,
  Zap,
} from "lucide-react";

export function LandingView() {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const setAuthMode = useUiStore((s) => s.setAuthMode);
  const user = useAuthStore((s) => s.user);

  const go = (fn: () => void) => {
    sound.unlock();
    sound.play("click");
    fn();
  };

  const modes = [
    {
      id: "local" as const,
      icon: <Users className="h-7 w-7" />,
      title: t("landing.modes.local.title"),
      desc: t("landing.modes.local.desc"),
      action: t("landing.modes.local.action"),
      grad: "from-amber-400 via-orange-400 to-orange-500",
      ring: "hover:shadow-orange-200/70",
      onClick: () => navigate("setup-local"),
    },
    {
      id: "ai" as const,
      icon: <Bot className="h-7 w-7" />,
      title: t("landing.modes.ai.title"),
      desc: t("landing.modes.ai.desc"),
      action: t("landing.modes.ai.action"),
      grad: "from-emerald-500 via-emerald-600 to-teal-600",
      ring: "hover:shadow-emerald-200/70",
      onClick: () => navigate("setup-ai"),
    },
    {
      id: "online" as const,
      icon: <Globe2 className="h-7 w-7" />,
      title: t("landing.modes.online.title"),
      desc: t("landing.modes.online.desc"),
      action: t("landing.modes.online.action"),
      grad: "from-rose-500 via-rose-600 to-pink-600",
      ring: "hover:shadow-rose-200/70",
      onClick: () => navigate("online"),
    },
  ];

  const steps = [
    {
      icon: <Dice5 className="h-6 w-6" />,
      title: t("landing.how.s1.title"),
      desc: t("landing.how.s1.desc"),
      cls: "bg-blue-50 text-blue-700 border-blue-200",
      num: "bg-blue-600",
    },
    {
      icon: <TrendingUp className="h-6 w-6" />,
      title: t("landing.how.s2.title"),
      desc: t("landing.how.s2.desc"),
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      num: "bg-emerald-600",
    },
    {
      icon: <Flag className="h-6 w-6" />,
      title: t("landing.how.s3.title"),
      desc: t("landing.how.s3.desc"),
      cls: "bg-purple-50 text-purple-700 border-purple-200",
      num: "bg-purple-600",
    },
  ];

  return (
    <div className="space-y-10 pb-6 sm:space-y-14">
      {/* ============================== HERO ============================== */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-800 via-blue-700 to-emerald-600 px-4 py-8 shadow-2xl sm:px-8 sm:py-12 lg:px-12 lg:py-16">
        {/* decorative winding snakes + ladder — instant Snakes & Ladders identity */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]"
          aria-hidden
        >
          {/* winding snake along the top edge */}
          <path
            d="M -2 12 C 12 4, 22 20, 34 12 S 52 2, 64 12 S 82 22, 102 10"
            fill="none"
            stroke="#facc15"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* second snake along the bottom edge */}
          <path
            d="M -2 88 C 14 96, 26 80, 40 88 S 58 98, 72 88 S 90 78, 102 90"
            fill="none"
            stroke="#4ade80"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* ladder leaning in the top-right corner */}
          <g stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round">
            <line x1="84" y1="6" x2="96" y2="30" />
            <line x1="90" y1="4" x2="102" y2="28" />
            <line x1="85.5" y1="12" x2="93.5" y2="10" />
            <line x1="88" y1="19" x2="96" y2="17" />
            <line x1="90.5" y1="26" x2="98.5" y2="24" />
          </g>
        </svg>

        {/* decorative blobs + confetti dots */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-amber-400/25 blur-3xl" />
          <div className="absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-rose-500/25 blur-3xl" />
          <div className="absolute left-1/3 top-10 h-24 w-24 rounded-full bg-yellow-300/20 blur-2xl" />
          <div className="absolute right-1/4 top-6 text-2xl opacity-40">🪜</div>
          <div className="absolute bottom-8 left-[8%] text-2xl opacity-40">🎲</div>
          <div className="absolute right-[6%] top-14 text-3xl opacity-40">🐍</div>
        </div>

        <div className="relative grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          {/* copy + CTAs */}
          <div className="text-center lg:text-left">
            <motion.span
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-200 backdrop-blur"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("landing.badge")}
            </motion.span>

            {/* unmistakable game wordmark */}
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.04 }}
              className="mt-4 inline-flex items-center gap-2.5 rounded-2xl border-2 border-amber-300/70 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 px-4 py-2 shadow-lg shadow-amber-900/40 sm:px-5 sm:py-2.5"
            >
              <span aria-hidden className="text-2xl leading-none sm:text-3xl">🐍</span>
              <span className="text-xl font-black uppercase tracking-wide text-white drop-shadow-[0_2px_0_rgba(180,83,9,0.8)] sm:text-2xl">
                Snakes &amp; Ladders
              </span>
              <span aria-hidden className="text-2xl leading-none sm:text-3xl">🪜</span>
            </motion.div>

            <motion.h1
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.08 }}
              className="mt-4 text-3xl font-black leading-tight text-white drop-shadow-sm sm:text-4xl lg:text-[2.75rem] xl:text-5xl"
            >
              {t("landing.hero.title")}
            </motion.h1>

            <motion.p
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.16 }}
              className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-blue-50/95 sm:text-base lg:mx-0"
            >
              {t("landing.hero.subtitle")}
            </motion.p>

            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.24 }}
              className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
            >
              <Button
                size="lg"
                className="h-13 bg-amber-400 px-8 text-base font-black text-amber-950 shadow-lg shadow-amber-900/30 transition hover:bg-amber-300 active:scale-95"
                onClick={() => go(() => navigate("play"))}
              >
                <Play className="mr-2 h-5 w-5" />
                {t("landing.cta.play")}
              </Button>
              <Button
                size="lg"
                className="h-13 bg-emerald-500 px-6 text-base font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-95"
                onClick={() => go(() => navigate("setup-local"))}
              >
                <Users className="mr-2 h-5 w-5" />
                {t("landing.cta.friends")}
              </Button>
              <Button
                size="lg"
                className="h-13 bg-violet-500 px-6 text-base font-bold text-white shadow-lg shadow-violet-900/30 transition hover:bg-violet-400 active:scale-95"
                onClick={() => go(() => navigate("setup-ai"))}
              >
                <Bot className="mr-2 h-5 w-5" />
                {t("landing.cta.ai")}
              </Button>
            </motion.div>

            {!user && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.36 }}
                className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-blue-100 lg:justify-start"
              >
                <button
                  className="font-semibold text-amber-200 underline-offset-2 hover:underline"
                  onClick={() =>
                    go(() => {
                      setAuthMode("register");
                      navigate("auth");
                    })
                  }
                >
                  {t("landing.cta.register")}
                </button>
                <span className="text-blue-300/60">·</span>
                <button
                  className="font-semibold underline-offset-2 hover:underline"
                  onClick={() =>
                    go(() => {
                      navigate("play");
                    })
                  }
                >
                  {t("landing.cta.guest")} <ArrowRight className="inline h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}

            {/* trust chips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.42 }}
              className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-blue-100/90 sm:text-xs lg:justify-start"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> 100% fair dice
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                <Wifi className="h-3.5 w-3.5 text-sky-300" /> Live online sync
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-300" /> Free to play
              </span>
            </motion.div>
          </div>

          {/* the board itself — the identity */}
          <div className="relative mx-auto w-full max-w-[430px] lg:max-w-[480px]">
            <HeroBoard />
          </div>
        </div>
      </section>

      {/* ============================== MODES ============================== */}
      <section>
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-black text-gray-900 sm:text-3xl">{t("landing.modes.title")}</h2>
          <p className="mt-1.5 text-sm text-gray-500 sm:text-base">{t("landing.modes.subtitle")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          {modes.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 + i * 0.08 }}
              className={`flex flex-col rounded-3xl bg-gradient-to-br p-5 text-white shadow-lg transition-transform hover:-translate-y-1 sm:p-6 ${m.grad} ${m.ring} hover:shadow-2xl`}
            >
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/20 shadow-inner backdrop-blur">
                {m.icon}
              </span>
              <h3 className="text-lg font-black">{m.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-white/85">{m.desc}</p>
              <Button
                className="mt-5 h-11 w-full bg-white/95 font-bold text-gray-900 shadow hover:bg-white active:scale-[0.98]"
                onClick={() => go(m.onClick)}
              >
                {m.action}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================== HOW TO PLAY ============================== */}
      <section className="rounded-[2rem] border border-gray-100 bg-white px-4 py-8 shadow-sm sm:px-8 sm:py-10">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-black text-gray-900 sm:text-3xl">{t("landing.how.title")}</h2>
          <p className="mt-1.5 text-sm text-gray-500 sm:text-base">{t("landing.how.subtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={i}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45 + i * 0.08 }}
              className={`relative rounded-2xl border p-5 ${s.cls}`}
            >
              <span
                className={`absolute -top-3 -left-3 grid h-8 w-8 place-items-center rounded-full text-sm font-black text-white shadow-md ${s.num}`}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-white/85 shadow-inner">
                {s.icon}
              </div>
              <h3 className="mb-1 font-bold text-gray-900">{s.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================== BOTTOM CTA ============================== */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 px-6 py-10 text-center shadow-xl sm:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-10 left-10 text-4xl opacity-25">🎲</div>
          <div className="absolute bottom-6 right-12 text-4xl opacity-25">🐍</div>
          <div className="absolute right-1/4 top-8 text-3xl opacity-20">🪜</div>
        </div>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.35 }}
          className="relative"
        >
          <div className="mx-auto mb-4 w-fit rounded-2xl bg-white/90 px-4 py-2.5 shadow-md">
            <BrandLogo />
          </div>
          <h2 className="text-2xl font-black text-white sm:text-3xl">{t("landing.bottom.title")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-purple-100 sm:text-base">
            {t("landing.bottom.subtitle")}
          </p>
          <Button
            size="lg"
            className="mt-6 h-13 bg-amber-400 px-10 text-base font-black text-amber-950 shadow-lg transition hover:bg-amber-300 active:scale-95"
            onClick={() => go(() => navigate("play"))}
          >
            <Play className="mr-2 h-5 w-5" />
            {t("landing.cta.play")}
          </Button>
        </motion.div>
      </section>

      {/* ranking teaser strip */}
      <section className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-5 py-4 text-center">
        <Trophy className="h-5 w-5 text-amber-600" />
        <div className="text-sm">
          <span className="font-bold text-gray-900">{t("landing.feature.ranking.title")}</span>
          <span className="text-gray-600"> — {t("landing.feature.ranking.desc")}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-1 border-amber-300 font-bold text-amber-800 hover:bg-amber-100"
          onClick={() => go(() => navigate("leaderboard"))}
        >
          <ArrowRight className="mr-1 h-3.5 w-3.5" />
          {t("nav.leaderboard")}
        </Button>
      </section>
    </div>
  );
}
