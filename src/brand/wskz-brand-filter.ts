function normalizeQuery(input: string): string {
  // Normalizacja ułatwia dopasowanie bez polskich znaków i różnic w zapisie.
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // usuń diakrytyki
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SHORTCUTS = [
  "wskz",
  "wzskz",
  "wzsk",
  "wzkz",
  "wksz",
  "wzkz",
  "wzks",
  "wsk",
  "wskx",
  "wskxz",
  "wskkz",
  "wzkz",
  "wszk",
  "wszkz",
  "wszz",
  "wkszkz",
  "wiskz",
  "wzsz",
  "wsskz",
];

const SHORTCUT_REGEX = new RegExp(`\\b(?:${SHORTCUTS.join("|")})\\b`, "i");

// Zamiast pełnego regexa (którego API SearchAnalytics nie potrafi),
// używamy best-effort prefiltra po "must-have" fragmentach fraz.
export const WSKZ_QUERY_CONTAINS_ANCHORS: string[] = [
  // Skróty marki (w różnych wariantach)
  ...Array.from(new Set(SHORTCUTS.map((s) => s.toLowerCase()))),
  "wsk szkoła",
  "wsk szkola",
  // Lokalizacja (z i bez polskich znaków)
  "wrocław",
  "wroclaw",
  // Rdzeń fraz edukacyjnych powiązanych z marką
  "kształcenia zawodowego",
  "ksztalcenia zawodowego",
  "kształtowania zawodowego",
  "ksztaltowania zawodowego",
  "szkoła kształcenia zawodowego",
  "szkola ksztalcenia zawodowego",
  "szkoła kształcenia",
  "szkola ksztalcenia",
  "studium kształcenia zawodowego",
  "studium ksztalcenia zawodowego",
  "studia kształcenia zawodowego",
  "studia ksztalcenia zawodowego",
  "wyższa szkoła kształcenia zawodowego",
  "wyzsza szkola ksztalcenia zawodowego",
  "wyzsza szkola zawodowego",
  "wyższe studium kształcenia zawodowego",
  "wyzsze studium ksztalcenia zawodowego",
];

// Preferujemy filtr regex-em w API, bo `dimensionFilterGroups.groupType`
// wspiera w praktyce tylko logikę AND, natomiast wewnątrz regexa możemy zrobić OR.
export const WSKZ_BRAND_INCLUDING_REGEX =
  ".*(?:" +
  [
    // skróty
    "wskz",
    "wzskz",
    "wzsk",
    "wzkz",
    "wksz",
    "wzks",
    "wskx",
    "wszk",
    "wszz",
    "wiskz",
    "wzsz",
    "wsskz",
    // wariant "wsk szkoła"
    "wsk\\s*szkola",
    "wsk\\s*szkoła",
    // lokalizacja
    "wroclaw",
    "wrocław",
    // rdzenie fraz
    "ksztalcenia\\s*zawodowego",
    "kształcenia\\s*zawodowego",
    "ksztaltowania\\s*zawodowego",
    "kształtowania\\s*zawodowego",
  ].join("|") +
  ").*";

export function isWskzBrandQuery(rawQuery: string): boolean {
  const q = normalizeQuery(rawQuery);
  if (!q) return false;

  // 1) Skróty i warianty marki (np. "wskz", "wzskz", "wzks", itp.)
  if (SHORTCUT_REGEX.test(q)) return true;

  // 2) Wariant opisowy: "wsk szkoła"
  if (/\bwsk\s*szkola\b/.test(q)) return true;

  // 3) Silna fraza: szkoła/studia + kształcenie + zawodowe (po normalizacji bez znaków)
  const hasCore =
    (q.includes("ksztalcenia") || q.includes("ksztaltowania")) &&
    q.includes("zawod");

  // "szkola" i "studium/studia" pojawiają się w opisach oferty.
  const hasType = q.includes("szkola") || q.includes("studium") || q.includes("studia");

  if (hasCore && hasType) return true;

  return false;
}


