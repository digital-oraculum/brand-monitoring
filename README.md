# Brand Monitoring

Lokalna aplikacja do analizy ruchu z **Google Search Console** — kliknięcia, wyświetlenia, CTR, pozycje, słowa kluczowe, strony, urządzenia i kraje.

## Wymagania

- Node.js 20+
- Konto Google z dostępem do witryn w Search Console
- Projekt w Google Cloud Console z włączonym Search Console API

## Konfiguracja Google Cloud

1. Wejdź na [Google Cloud Console](https://console.cloud.google.com/).
2. Utwórz nowy projekt (lub wybierz istniejący).
3. Włącz **Google Search Console API**:
   - APIs & Services → Library → wyszukaj „Google Search Console API” → Enable
4. Skonfiguruj **OAuth consent screen**:
   - User type: External (lub Internal w organizacji)
   - Dodaj scope: `.../auth/webmasters.readonly`
   - Dodaj siebie jako test user (tryb Testing)
5. Utwórz **OAuth 2.0 Client ID**:
   - Typ: **Web application**
   - Authorized redirect URI: `http://127.0.0.1:3300/auth/callback`
6. Skopiuj Client ID i Client Secret do pliku `.env`.

## Uruchomienie

```bash
cd "Projects/Brand Monitoring"
cp .env.example .env
# uzupełnij GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET

npm install
npm run dev
```

Otwórz: **http://127.0.0.1:3300**

## Dashboardy

| Zakładka | Co pokazuje |
|----------|-------------|
| **Przegląd** | KPI + trend dzienny kliknięć/wyświetleń + podział urządzeń |
| **Słowa kluczowe** | Top 50 zapytań z metrykami |
| **Strony** | Top 50 URL-i |
| **Urządzenia** | Desktop / Mobile / Tablet |
| **Kraje** | Top 20 krajów |

## Uwagi

- GSC ma opóźnienie danych ~2–3 dni — domyślny zakres dat kończy się 3 dni wstecz.
- Tokeny OAuth są zapisywane lokalnie w `data/tokens.json`.
- Aplikacja jest przeznaczona do użytku lokalnego (single-user).

## API (REST)

| Endpoint | Opis |
|----------|------|
| `GET /api/auth/status` | Status logowania |
| `GET /api/sites` | Lista witryn GSC |
| `GET /api/analytics/overview?siteUrl=&startDate=&endDate=` | KPI + trend |
| `GET /api/analytics/queries?...` | Słowa kluczowe |
| `GET /api/analytics/pages?...` | Strony |
| `GET /api/analytics/devices?...` | Urządzenia |
| `GET /api/analytics/countries?...` | Kraje |

## Stack

- Fastify + TypeScript
- Google APIs (`googleapis`)
- Chart.js (frontend)
- OAuth 2.0 (offline refresh token)
