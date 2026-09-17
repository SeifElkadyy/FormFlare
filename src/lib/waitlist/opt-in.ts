/**
 * Double opt-in without a mailer is a silent black hole: the signup is stored
 * unconfirmed, no email goes out, and the visitor never gets a position.
 */
export function refuseDoubleOptIn(opts: {
  mode: string;
  enable: boolean;
  alreadyOn: boolean;
  mailerAvailable: boolean;
}): string | null {
  if (opts.mode !== "waitlist" || !opts.enable) return null;
  if (opts.mailerAvailable) return null;
  if (opts.alreadyOn) return null;
  return "Turn on email in Settings before enabling double opt-in. Without it, signups sit unconfirmed.";
}
