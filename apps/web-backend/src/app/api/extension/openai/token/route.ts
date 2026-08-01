// GET /api/extension/openai/token — mints an ephemeral OpenAI Realtime client secret for an
// authenticated extension user, so the raw API key never reaches the browser.
// Mirrors /api/mac/openai/token's response shape exactly.

import type { NextRequest } from "next/server";
import { handleExtensionOpenAITokenRequest } from "@/lib/extensionOpenaiTokenRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleExtensionOpenAITokenRequest(request);
}
