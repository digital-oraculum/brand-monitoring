# Brand Monitoring

Aplikacja do analizy **ruchu brandowego WSKZ** z Google Search Console — kliknięcia, wyświetlenia, CTR, pozycje, słowa kluczowe oraz podział na kategorie intencji.

**Szczegółowa dokumentacja** (filtrowanie fraz, kategorie, metryki, cache): [DOKUMENTACJA.md](./DOKUMENTACJA.md)

## Wymagania

- Node.js 20+
- **SEO/GEO Login Gateway** (logowanie użytkowników Google)
- Token GSC z dostępem do domen WSKZ (`webmasters.readonly`)
- Projekt w Google Cloud Console z włączonym Search Console API (osobny od Login Gateway)

## Konfiguracja

### Logowanie użytkownika (SSO)

Logowanie obsługuje [seo-geo-login-gateway](../seo-geo-login-gateway). W `.env`:

- `LOGIN_GATEWAY_URL` — np. `http://127.0.0.1:3400`
- `PUBLIC_BASE_URL` — origin tej appki (musi być na `ALLOWED_RETURN_ORIGINS` gatewaya)
- `SESSION_SECRET` — **ten sam** co na Login Gateway

### Google Search Console (serwer)

1. Wejdź na [Google Cloud Console](https://console.cloud.google.com/) — projekt **GSC** (nie Login Gateway).
2. Włącz **Google Search Console API**.
3. OAuth client + token serwisowy (`webmasters.readonly`) — lokalnie `data/tokens.json`, na Vercel `GSC_TOKENS_JSON`.
4. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` w `.env` służą **tylko GSC**, nie logowaniu UI.

## Uruchomienie

```bash
cd "Projects/Brand Monitoring"
cp .env.example .env
# uzupełnij GOOGLE_* (GSC), SESSION_SECRET, LOGIN_GATEWAY_URL, PUBLIC_BASE_URL

npm install
npm run dev
```

Otwórz: **http://127.0.0.1:3300** (Login Gateway musi działać na `:3400`).

## Raporty

| Zakładka | Co pokazuje |
|----------|-------------|
| **Raport brand** | KPI, trend kliknięć/wyświetleń, rozkład domen, tabela fraz brandowych |
| **Raport brand z podziałem na kategorie** | Te same frazy z kategoriami (czysty brand, miasta, nawigacyjne, reputacyjne, sprzedażowe, praca, pozostałe) |

## Uwagi

- GSC ma opóźnienie danych ~2–3 dni — domyślny zakres kończy się 3 dni wstecz.
- Frazy brandowe są filtrowane dwuetapowo (regex GSC + `isWskzBrandQuery`) — szczegóły w [DOKUMENTACJA.md](./DOKUMENTACJA.md).
- Domeny: `WSKZ_DOMAINS` (domyślnie wskz.pl, studia-online.pl, studia-pedagogiczne.pl, studia-wroclaw.pl).

## Stack

- Fastify + TypeScript
- Google APIs (`googleapis`)
- Chart.js (frontend)
- OAuth 2.0 (sesja użytkownika + token GSC serwera)
- Vercel (deploy produkcyjny)
