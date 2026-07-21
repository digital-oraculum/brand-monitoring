/**
 * Kategoryzacja fraz brandowych WSKZ — logika jak w BigQuery CASE:
 * kolejność reguł ma znaczenie, pierwsze dopasowanie wygrywa.
 *
 * Priorytet (1 = najwyższy):
 * 1. Czysty brand
 * 2. Miasta
 * 3. Frazy nawigacyjne/informacyjne
 * 4. Frazy reputacyjne
 * 5. Frazy sprzedażowe
 * 6. Praca
 * 7. Pozostałe (ELSE)
 *
 * Dlatego np. „wskz opinie warszawa” → Miasta (przed reputacją),
 * a „wskz studia podyplomowe” → sprzedażowe (po reputacji, jeśli ta nie matchuje).
 */

/** Separator zgodny z `[[:space:][:punct:]]` w BigQuery. */
const S = "[\\s\\p{P}]";

export const WSKZ_QUERY_CATEGORIES = [
  "Czysty brand",
  "Miasta",
  "Frazy nawigacyjne/informacyjne",
  "Frazy reputacyjne",
  "Frazy sprzedażowe",
  "Praca",
  "Pozostałe",
] as const;

export type WskzQueryCategory = (typeof WSKZ_QUERY_CATEGORIES)[number];

/** Priorytet kategorii (1 = sprawdzana najwcześniej). */
export function getCategoryPriority(category: WskzQueryCategory): number {
  const index = WSKZ_QUERY_CATEGORIES.indexOf(category);
  return index >= 0 ? index + 1 : WSKZ_QUERY_CATEGORIES.length;
}

function normalizeForCategory(input: string): string {
  return input.toLowerCase().trim();
}

/** Reguły w kolejności CASE — nie zmieniać kolejności bez świadomej decyzji produktowej. */
const CATEGORY_RULES: Array<{ category: Exclude<WskzQueryCategory, "Pozostałe">; regex: RegExp }> = [
  {
    category: "Czysty brand",
    regex: new RegExp(
      `^(?:uczelnia|wskz${S}*pl|(?:wroc[łl][aą]w${S}+|wroclaw${S}+|wroclawsk(?:a|iej|ie|i)?${S}+)?(?:wskz${S}+wy[żz]sza${S}+szko[łl]a${S}+kszta[łl]cenia${S}+za?wodowego|wskz|wzsz|wzskz|wzsk|wzkz|wzks|wszz|wszkz|wszk|wsskz|wskxz|wskx|wskkz|wsk${S}+szko[łl]a|wksz|wiskz|wy[żz](?:sza|szej|sz[ąa]|sze|szych|szym|szymi)${S}+(?:szko[łl](?:a|y|e|[ęe]|[ąa]|o|om|ami|ach)|szk[oó][łl])${S}+(?:(?:szkolenia|kszta[łl]towania|kszta[łl]ceni(?:a|e)|ksztalcenia|kaztalcenia)${S}+za?wodowego|kszta[łl]cenia|ksztalcenia|zawodow(?:a|ej|[ąa]|e|ych|ym|ymi))|wy[żz](?:sze|szego|szemu|szym|szych|szymi)${S}+(?:studium|studi(?:a|[oó]w|om|ami|ach))${S}+(?:kszta[łl]cenia|ksztalcenia|kaztalcenia)${S}+za?wodowego|(?:szko[łl](?:a|y|e|[ęe]|[ąa]|o|om|ami|ach)|szk[oó][łl])${S}+wy[żz](?:sza|szej|sz[ąa]|sze|szych|szym|szymi)${S}+(?:kszta[łl]cenia|ksztalcenia|kaztalcenia)${S}+za?wodowego|(?:szko[łl](?:a|y|e|[ęe]|[ąa]|o|om|ami|ach)|szk[oó][łl])${S}+(?:kszta[łl]cenia|ksztalcenia|kaztalcenia)${S}+za?wodowego|szko[łl]a${S}+(?:kszta[łl]cenia|ksztalcenia|kaztalcenia))(?:${S}+(?:wskz|online|wroc[łl][aą]w|we${S}+wroc[łl]awiu|w${S}+wroc[łl]awiu|powsta[ńn]c[oó]w(?:${S}+[śs]l[ąa]skich)?))?${S}*)$`,
      "iu",
    ),
  },
  {
    category: "Miasta",
    regex:
      /.*(?:warszaw|kielc|rzesz[oó]w|rzeszow|lublin|przemy[śs]l|przemysl|krak[oó]w|krakow|katowic|pozna[ńn]|poznan|szczecin|starogard[\s\p{P}]+gda[ńn]sk|starogard[\s\p{P}]+gdansk|gda[ńn]sk|gdansk|bydgoszcz|[łl][oó]d[źz]|[łl]odz|[łl]odzi|gdyni(?:a|i)).*/iu,
  },
  {
    category: "Frazy nawigacyjne/informacyjne",
    regex:
      /.*(?:logowanie|zaloguj|login|konto|panel|platforma|aplikacja|kontakt|telefon|adres|dziekan|dziekanat|egzamin|praktyki|rezygnacja|harmonogram|zjazdy|wskz[\s\p{P}]+online|infolinia|regulamin|app|rektor|nip|kalendarz[\s\p{P}]+akademicki|organizacja[\s\p{P}]+roku[\s\p{P}]+akademickiego|test[\s\p{P}]+generalny|testy[\s\p{P}]+cz[ąa]stkowe|semestr|terminy[\s\p{P}]+sesji|sesja|legitymacja|za[śs]wiadczeni(?:e|a|u|em)?|za[śs]wiadczenie[\s\p{P}]+o[\s\p{P}]+studiowaniu|za[śs]wiadczenie[\s\p{P}]+o[\s\p{P}]+zatrudnieniu|zwolnienie[\s\p{P}]+z[\s\p{P}]+praktyk|dziennik[\s\p{P}]+praktyk|formularz[\s\p{P}]+ko[ńn]cowy|mail|testy[\s\p{P}]+odpowiedzi|testy[\s\p{P}]+cz[ąa]stkowe[\s\p{P}]+odpowiedzi|erasmus|siedziba|zmiana[\s\p{P}]+kierunku|regon|log[\s\p{P}]+in|gdzie[\s\p{P}]+jest|(?:^|[\s\p{P}])ted[\s\p{P}]*x(?:[\s\p{P}]|$)|wskz[\s\p{P}]+ted(?:[\s\p{P}]*x)?(?:[\s\p{P}]|$)|do[\s\p{P}]+kiedy[\s\p{P}]+trwa|jak[\s\p{P}]+zrezygnowa[ćc]|czy[\s\p{P}]+mo[żz]na[\s\p{P}]+zrezygnowa[ćc]|kiedy[\s\p{P}]+ko[ńn]czy[\s\p{P}]+si[ęe]|uczelnia.*(?:kontakt|adres|dziekanat|dziekan|siedziba)|(?:kontakt|adres|dziekanat|dziekan|siedziba).*uczelnia).*/iu,
  },
  {
    category: "Frazy reputacyjne",
    regex:
      /.*(?:opini(?:a|e|i|ach)?|recenzj(?:a|e|i)?|reviews?|forum|gowork|wykop|reddit|onet|newsweek|negatywn(?:e|a|ych)?[\s\p{P}]+opinie|z[łl]e[\s\p{P}]+opinie|s[łl]abe[\s\p{P}]+opinie|nie[\s\p{P}]+polecam|odradzam|oszustwo|oszust|oszu[śs]ci|oszukali|scam|fake|[śs]ciema|naci[ąa]ganie|afera|kontrowersj(?:e|a|i|ach)?|nieprawid[łl]owo[śs]ci|prokuratur(?:a|y|ze|[ąa])?|skarg(?:a|i|[ęe]|ami|ach)?|reklamacj(?:a|e|i|[ęe]|ami|ach)?|problem(?:y|em|ami|ach)?|uokik|rzecznik|kontrol(?:a|e|i|[ąa])?|bip|legit|legaln(?:a|e|y|o[śs][ćc])|akredytac|akredytow|ministerstwo|uprawnienia|(?:^|[\s\p{P}])dyplom(?:y|u|em|ie|ów|ami|ach)?(?:[\s\p{P}]|$)|uznawan(?:y|a|e|ego|ej|ych|ymi)?|czy[\s\p{P}]+dyplom|czy[\s\p{P}]+warto|czy[\s\p{P}]+wskz[\s\p{P}]+to[\s\p{P}]+dobra[\s\p{P}]+uczelnia|co[\s\p{P}]+dalej[\s\p{P}]+z[\s\p{P}]+wskz|renoma|presti[żz]|jako[śs][ćc]|(?:^|[\s\p{P}])poziom(?:[\s\p{P}]|$)).*/iu,
  },
  {
    category: "Frazy sprzedażowe",
    regex:
      /.*(?:czy[\s\p{P}]+zjazdy[\s\p{P}]+s[ąa][\s\p{P}]+obowi[ąa]zkowe|jak[\s\p{P}]+wygl[ąa]daj[ąa][\s\p{P}]+egzaminy|co[\s\p{P}]+to|kierun(?:ek|ki|ku|kach)?|studia|studia[\s\p{P}]+podyplomowe|studia[\s\p{P}]+online|podyplomowe|rekrutacj(?:a|e|i|[ęe])|cena|cennik|koszt|por[oó]wnani(?:e|a)?|vs|versus|psychologi(?:a|i|e|[ąa])?|prawo|kadra|logistyk(?:a|i|[ęe]|[ąa])?|logopedi(?:a|i|e|[ąa])?|oligofrenopedagogik(?:a|i|e|[ąa])?|przygotowanie[\s\p{P}]+pedagogiczne|pedagogik(?:a|i|e|[ąa])?|cyberbezpiecze[ńn]stwo|bibliotekoznawstwo|licencjat|kryminologi(?:a|i|e|[ąa])?|dietetyk(?:a|i|e|[ąa])?|integracja[\s\p{P}]+sensoryczna|terapia[\s\p{P}]+pedagogiczna|administracj(?:a|i|e|[ąa])?|magisterskie|magister|autyzm|informatyk(?:a|i|e|[ąa])?|rolnictwo|oferta|status[\s\p{P}]+studenta|ubezpieczenie[\s\p{P}]+zdrowotne|kurs(?:y|u|em|ach)?|psychotraumatologi(?:a|i|e|[ąa])?|mba|dofinansowanie|bezpiecze[ńn]stwo[\s\p{P}]+wewn[ęe]trzne|zarz[ąa]dzani(?:e|a|u|em)?|zarz[ąa]dzanie[\s\p{P}]+o[śs]wiat[ąa]|pedagogiczne|finanse[\s\p{P}]+i[\s\p{P}]+rachunkowo[śs][ćc]|edukacja[\s\p{P}]+i[\s\p{P}]+rehabilitacja|arteterapi(?:a|i|e|[ąa])?|stypendi|zapisy|zapisz|op[łl]at(?:a|y|[ęe]|ami)?|promocja|rabat|warunki[\s\p{P}]+zakupu|czy[\s\p{P}]+wybra[ćc]|program[\s\p{P}]+studi[oó]w|wymagania|kwalifikacje).*/iu,
  },
  {
    category: "Praca",
    regex: /.*(?:(?:^|[\s\p{P}])(?:praca|kariera)(?:[\s\p{P}]|$)|ofert(?:a|y)[\s\p{P}]+prac(?:y|a)).*/iu,
  },
];

export function categorizeWskzQuery(rawQuery: string): WskzQueryCategory {
  const q = normalizeForCategory(rawQuery);
  if (!q) return "Pozostałe";

  // First-match-wins — jak WHEN ... THEN w CASE (kolejność = priorytet).
  for (const rule of CATEGORY_RULES) {
    if (rule.regex.test(q)) {
      return rule.category;
    }
  }

  return "Pozostałe";
}
