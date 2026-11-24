"use client";

import { useState } from "react";

export const AVATAR_EMOJI: Record<string, string> = {
  snake: "🐍",
  ladder: "🪜",
  dice: "🎲",
  crown: "👑",
  rocket: "🚀",
  fire: "🔥",
  star: "⭐",
  tiger: "🐯",
  frog: "🐸",
};

/** Profile picture: the Google photo by default, an emoji badge if the player picked one, initials as the fallback. */
export function UserAvatar({
  name,
  picture,
  avatar,
  className = "h-9 w-9",
  textClass = "text-sm",
}: {
  name: string;
  picture?: string | null;
  avatar?: string | null;
  className?: string;
  textClass?: string;
}) {
  const [broken, setBroken] = useState(false);
  const emoji = avatar && avatar !== "google" ? AVATAR_EMOJI[avatar] : null;
  const base = `grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`;
  if (emoji) {
    return (
      <span className={`${base} bg-amber-100 ${textClass}`} aria-label={name}>
        {emoji}
      </span>
    );
  }
  if (picture && !broken) {
    return (
      <img src={picture} alt={name} referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className={`${base} object-cover`} />
    );
  }
  return (
    <span className={`${base} bg-emerald-600 font-bold text-white ${textClass}`} aria-label={name}>
      {name.trim().slice(0, 2).toUpperCase()}
    </span>
  );
}
