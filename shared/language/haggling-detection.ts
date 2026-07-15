/**
 * Haggling / price-negotiation keyword detection for conversations.
 *
 * Used by both the server-side quest-trigger-analyzer and the client-side
 * BabylonChatPanel to detect when a player is negotiating prices during
 * merchant conversations, firing the `price_haggled` event.
 */

/** Keywords and phrases indicating price negotiation intent, grouped by language. */
const HAGGLING_PATTERNS: Record<string, RegExp> = {
  // English price/negotiation vocabulary
  english: /\b(price|discount|cheaper|cheap|expensive|cost|bargain|haggle|negotiate|deal|lower|reduce|offer|afford|pay less|how much|too much|best price|good price|better price|fair price|less than|cut the price|make a deal|money|budget)\b/i,

  // French
  french: /\b(prix|r[eé]duction|moins cher|cher|co[uû]t|marchander|n[eé]gocier|affaire|baisser|r[eé]duire|offre|payer moins|combien|trop cher|meilleur prix|bon prix|argent|budget|remise|solde|rabais)\b/i,

  // Spanish
  spanish: /\b(precio|descuento|m[aá]s barato|barato|caro|costo|regatear|negociar|oferta|bajar|reducir|pagar menos|cu[aá]nto|muy caro|mejor precio|buen precio|dinero|presupuesto|rebaja)\b/i,

  // German
  german: /\b(preis|rabatt|billiger|billig|teuer|kosten|handeln|verhandeln|angebot|senken|reduzieren|weniger zahlen|wie ?viel|zu teuer|bester preis|guter preis|geld|budget|nachlass)\b/i,

  // Italian
  italian: /\b(prezzo|sconto|meno caro|caro|costo|contrattare|negoziare|offerta|abbassare|ridurre|pagare meno|quanto|troppo caro|miglior prezzo|buon prezzo|soldi|budget)\b/i,

  // Number patterns that suggest price discussion (e.g., "5 euros", "$10", "50%")
  numeric: /\b\d+\s*(%|euros?|dollars?|pounds?|€|\$|£|coins?|gold|silver|pence|centimes?|francs?)/i,
};

/**
 * Test whether a player message contains haggling/price-negotiation intent.
 *
 * @param message - The player's chat message
 * @param targetLanguage - Optional target language name to prioritise matching
 * @returns true if the message contains haggling keywords
 */
export function detectHagglingIntent(message: string, targetLanguage?: string): boolean {
  if (!message || message.trim().length === 0) return false;

  const text = message.trim();

  // Always check numeric patterns and English
  if (HAGGLING_PATTERNS.numeric.test(text)) return true;
  if (HAGGLING_PATTERNS.english.test(text)) return true;

  // Check target language if specified
  if (targetLanguage) {
    const lang = targetLanguage.toLowerCase();
    const pattern = HAGGLING_PATTERNS[lang];
    if (pattern && pattern.test(text)) return true;
  }

  // Check all language patterns as fallback (player might use any language)
  for (const [lang, pattern] of Object.entries(HAGGLING_PATTERNS)) {
    if (lang === 'english' || lang === 'numeric') continue; // already checked
    if (pattern.test(text)) return true;
  }

  return false;
}
