/**
 * Sapludu — info dialogs (terms, privacy, about).
 */
"use client";

import { useUiStore } from "@/stores/ui-store";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function InfoDialogs() {
  const t = useT();
  const dialog = useUiStore((s) => s.dialog);
  const setDialog = useUiStore((s) => s.setDialog);
  const language = useUiStore((s) => s.language);

  return (
    <>
      <Dialog open={dialog.terms} onOpenChange={(v) => setDialog("terms", v)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("footer.terms")}</DialogTitle>
            <DialogDescription>Sapludu — Terms &amp; Conditions</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-gray-600">
            <p>
              1. Sapludu is provided as-is for entertainment. You agree to play fairly and not to
              tamper with, automate, or reverse-engineer game communication.
            </p>
            <p>
              2. Online matches are enforced by an authoritative server. Attempts to submit fake
              dice results, positions, or automate turns may result in suspension.
            </p>
            <p>
              3. Accounts may be suspended for abusive display names, harassment of other players, or
              exploiting platform bugs.
            </p>
            <p>
              4. Ratings and leaderboard placement are competitive records; manipulating them
              (e.g. staged matches between coordinated accounts) is prohibited and monitored.
            </p>
            <p>
              5. {language === "bn" ? "বাংলা সংস্করণ শীঘ্রই আসছে।" : "These terms may be updated; material changes will be announced in-app."}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.privacy} onOpenChange={(v) => setDialog("privacy", v)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("footer.privacy")}</DialogTitle>
            <DialogDescription>Sapludu — Privacy Policy</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-gray-600">
            <p>
              1. You sign in with Google. We receive your Google e-mail address, name and profile
              picture and store them with your display name, avatar choice, language preference and
              gameplay statistics in the operator&apos;s Google Sheet.
            </p>
            <p>
              2. We never see or store your Google password. Your browser keeps a random session
              token (in local storage); the server stores only its hash and you can sign out of all
              devices from your profile.
            </p>
            <p>
              3. Match records (moves, results, ratings) are kept to power profiles, leaderboards
              and abuse prevention.
            </p>
            <p>
              4. We never sell personal data. Guest players&apos; local games never leave your device
              — they are not recorded server-side.
            </p>
            <p>
              5. You can delete your account yourself from Profile → Account. Your profile, friends
              and sessions are erased; finished matches stay in the history of other players with
              your name anonymised.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.about} onOpenChange={(v) => setDialog("about", v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("footer.about")}</DialogTitle>
            <DialogDescription>{t("brand.name")} · {t("brand.native")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-gray-600">
            <p>
              {t("footer.madeFor")}
            </p>
            <p>
              {language === "bn"
                ? "সাপলুডু বাংলাদেশের প্রিয় ঐতিহ্যবাহী খেলা — এখন আধুনিক প্রযুক্তিতে, বন্ধুদের সাথে অনলাইনে খেলার জন্য তৈরি।"
                : "Sapludu (সাপলুডু) rebuilds the beloved Bangladeshi Snakes & Ladders with a server-authoritative engine, animated boards, Elo ranking and bilingual EN/বাংলা support."}
            </p>
            <p className="text-xs text-gray-400">Play. Climb. Win. — খেলুন। উঠুন। জিতুন।</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
