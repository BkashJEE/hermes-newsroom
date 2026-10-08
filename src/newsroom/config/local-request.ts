/**
 * Is this request from the Newsroom page running on this machine?
 *
 * The local API routes change saved state and reach paid providers, so they
 * answer the local page and nothing else. Three conditions, each covering a
 * different way a request could arrive:
 *
 * - a loopback `Host`, so the server was reached on this machine;
 * - a same-origin `Origin` when one is sent, so another site's page cannot
 *   drive these routes from a browser that can reach them;
 * - an `x-newsroom-client` header, which a cross-origin form or `<img>` cannot
 *   set and which therefore turns any such request into a CORS preflight.
 *
 * The port is deliberately not fixed. `npm run dev` serves 3510, `npm start`
 * serves 3520, and `scripts/install.mjs --port N` serves whatever the user
 * chose — a hardcoded pair silently breaks that last case.
 */
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;

export function loopbackHost(host: string | null | undefined): boolean {
  return typeof host === "string" && LOOPBACK.test(host);
}

export function localRequest(host: string | null | undefined, origin: string | null): boolean {
  if (!loopbackHost(host)) return false;
  // A browser omits Origin on same-origin GETs; a cross-origin one always sends it.
  return !origin || origin === `http://${host}` || origin === `https://${host}`;
}
