/**
 * Sapludu — achievement system.
 * Definitions are static and bilingual; unlocks are persisted in UserAchievement.
 * Awards happen only after verified game completion (never client-reported),
 * with unique constraint preventing duplicate awards.
 */

export interface AchievementDef {
  id: string;
  titleEn: string;
  titleBn: string;
  descEn: string;
  descBn: string;
  icon: string; // lucide icon name
  /** evaluation context: user stats AFTER the completing game */
  check: (ctx: AchievementContext) => boolean;
}

export interface AchievementContext {
  gamesPlayed: number;
  wins: number;
  bestStreak: number;
  hasOnlineGame: boolean;
  hasOnlineWin: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_victory",
    titleEn: "First Victory",
    titleBn: "প্রথম জয়",
    descEn: "Win your first Sapludu match",
    descBn: "আপনার প্রথম সাপলুডু ম্যাচ জিতুন",
    icon: "trophy",
    check: (c) => c.wins >= 1,
  },
  {
    id: "first_online",
    titleEn: "First Online Match",
    titleBn: "প্রথম অনলাইন ম্যাচ",
    descEn: "Complete an online multiplayer match",
    descBn: "একটি অনলাইন মাল্টিপ্লেয়ার ম্যাচ সম্পন্ন করুন",
    icon: "globe",
    check: (c) => c.hasOnlineGame,
  },
  {
    id: "games_10",
    titleEn: "10 Games Played",
    titleBn: "১০ গেম খেলা",
    descEn: "Play 10 matches on the platform",
    descBn: "প্ল্যাটফর্মে ১০টি ম্যাচ খেলুন",
    icon: "gamepad-2",
    check: (c) => c.gamesPlayed >= 10,
  },
  {
    id: "wins_10",
    titleEn: "10 Victories",
    titleBn: "১০ জয়",
    descEn: "Win 10 matches",
    descBn: "১০টি ম্যাচ জিতুন",
    icon: "medal",
    check: (c) => c.wins >= 10,
  },
  {
    id: "streak_5",
    titleEn: "5 Consecutive Wins",
    titleBn: "৫ জয়ের ধারা",
    descEn: "Win 5 matches in a row",
    descBn: "টানা ৫টি ম্যাচ জিতুন",
    icon: "flame",
    check: (c) => c.bestStreak >= 5,
  },
  {
    id: "games_100",
    titleEn: "100 Games Played",
    titleBn: "১০০ গেম খেলা",
    descEn: "Reach 100 career matches",
    descBn: "ক্যারিয়ারে ১০০টি ম্যাচ সম্পন্ন করুন",
    icon: "crown",
    check: (c) => c.gamesPlayed >= 100,
  },
  {
    id: "multiplayer_champion",
    titleEn: "Multiplayer Champion",
    titleBn: "মাল্টিপ্লেয়ার চ্যাম্পিয়ন",
    descEn: "Win an online multiplayer match",
    descBn: "একটি অনলাইন মাল্টিপ্লেয়ার ম্যাচ জিতুন",
    icon: "shield",
    check: (c) => c.hasOnlineWin,
  },
];

export function evaluateAchievements(ctx: AchievementContext, alreadyUnlocked: Set<string>): string[] {
  return ACHIEVEMENTS.filter((a) => !alreadyUnlocked.has(a.id) && a.check(ctx)).map((a) => a.id);
}

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
