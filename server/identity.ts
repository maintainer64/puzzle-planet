import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
export const COOKIE_NAME = "puzzle_player";
export function anonymousPlayer(request: IncomingMessage, response: ServerResponse, secure = false): string {
  const matches = (request.headers.cookie ?? "").split(";").map(c => c.trim()).filter(c => c.startsWith(`${COOKIE_NAME}=`)).map(c => c.slice(COOKIE_NAME.length + 1));
  const token = matches.length === 1 && /^[a-f0-9]{64}$/.test(matches[0]) ? matches[0] : randomBytes(32).toString("hex");
  response.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure ? "; Secure" : ""}`);
  // The token itself never appears in player IDs or JSON returned to browsers.
  return createHash("sha256").update(token).digest("hex");
}
