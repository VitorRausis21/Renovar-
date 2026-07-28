// Wrapper minimo da Evolution API para Edge Functions.
// Replica logica de backend/src/services/evolutionApiService.js

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE =
  Deno.env.get("EVOLUTION_API_INSTANCE") ??
  Deno.env.get("EVOLUTION_INSTANCE") ??
  "diversao-brinquedos";

export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");

  // Sem 55 na frente: prefixa (celular 11 dig / fixo 10 dig)
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = "55" + digits;
  }

  // Remove o "9" duplicado apos o DDD quando ficou com 14 digitos
  // (55 DD 9 seguido de mais 9 digitos -> mantem 55 DD + 9 digitos).
  // Ex: 55419995591338 -> 5541995591338. Espelha backend/src/utils/formatPhone.js.
  if (digits.length === 14) {
    digits = digits.replace(/^(55\d{2})9(\d{9})$/, "$1$2");
  }

  return digits;
}

export type SendResult =
  | { success: true; messageId?: string; remoteJid?: string }
  // canRetry=false: nao retentar (pode ter sido entregue mesmo com erro)
  | { success: false; canRetry: false; error: string }
  // canRetry=true: erro definitivo (config invalida, telefone invalido). NUNCA foi entregue.
  | { success: false; canRetry: true; error: string };

// Timeout generoso: Evolution API no Fly free tier pode demorar.
const SEND_TIMEOUT_MS = 60_000;

// Verifica se o erro indica timeout/incerteza sobre entrega. Conservador:
// na duvida, assume que NAO podemos retentar (preferimos perder uma msg
// a enviar 4x duplicado).
function isUncertainDelivery(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("abort") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  );
}

export async function sendText(to: string, text: string): Promise<SendResult> {
  if (!EVOLUTION_API_KEY || !EVOLUTION_API_URL) {
    return { success: false, canRetry: true, error: "Evolution API not configured" };
  }
  const number = formatPhone(to);
  if (!number) return { success: false, canRetry: true, error: "Invalid phone number" };

  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number, text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      const errorMsg = `HTTP ${res.status}: ${body}`;

      // 5xx ou erro com timeout no body: Evolution pode ter processado mesmo
      // retornando erro. NAO retentar para evitar duplicacao.
      // 4xx (exceto 408/429): erro de validacao/auth, msg nao foi entregue, pode retentar
      //   se quisermos (mas o erro tipicamente persiste, entao retry nao adianta).
      const isServerError = res.status >= 500;
      const isTimeoutLike = res.status === 408 || res.status === 504;
      const bodyHasTimeout = isUncertainDelivery(body);

      const canRetry = !(isServerError || isTimeoutLike || bodyHasTimeout);
      return { success: false, canRetry, error: errorMsg };
    }

    const data = await res.json();
    return {
      success: true,
      messageId: data?.key?.id,
      remoteJid: data?.key?.remoteJid,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // AbortSignal timeout, fetch failed, network errors:
    // nao sabemos se a Evolution chegou a processar. NAO retentar.
    if (isUncertainDelivery(msg)) {
      return { success: false, canRetry: false, error: msg };
    }
    // Erro estrutural (typo no codigo, etc) — pode retentar
    return { success: false, canRetry: true, error: msg };
  }
}

export async function findMessages(limit = 20) {
  if (!EVOLUTION_API_KEY || !EVOLUTION_API_URL) {
    return { records: [] as any[] };
  }
  const res = await fetch(
    `${EVOLUTION_API_URL}/chat/findMessages/${EVOLUTION_INSTANCE}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ where: { key: { fromMe: false } }, limit }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) {
    throw new Error(`Evolution findMessages HTTP ${res.status}`);
  }
  const data = await res.json();
  return { records: (data?.messages?.records ?? []) as any[] };
}
