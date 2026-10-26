# Ski World

Ett skidspel i 3D som körs direkt i webbläsaren. Spela på **https://iwap.github.io/ski-world/**.

Spelet är vanlig JavaScript med [Three.js](https://threejs.org/). Det behövs inga byggverktyg eller paket – öppna `index.html` i webbläsaren så startar spelet.

## Mappar

| Sökväg | Innehåll |
|---|---|
| `index.html`, `style.css` | Sidan och dess utseende |
| `i18n.js` | Alla texter på svenska, engelska, spanska och nederländska |
| `audio.js` | Musik och ljudeffekter |
| `config.js` | Adress och publik nyckel till servern (Supabase) |
| `js/core/` | Hjälpfunktioner, sparning och tangentbord |
| `js/data/` | Banor, karaktärer, badges och butikens innehåll |
| `js/world/` | Backen: terräng, hinder, hopp, rails, nät, bottar |
| `js/player/` | Åkaren: 3D-modell, fysik, tricks och krascher |
| `js/render/` | 3D-scenen: kamera, rörelser, effekter och kvällsläge |
| `js/ui/` | Menyer, butik, topplista, tutorial, HUD och pekknappar |
| `js/game/` | Ett åk från start till mål och sittliften |
| `js/online/` | Servern, online-lägen och dagens utmaning |
| `js/main.js` | Huvudloopen som startar spelet |
| `supabase.sql` | Databasen (tabeller, regler och funktioner) |
| `tests/` | Automatiska tester |
| `v1/` | Den första 2D-versionen |

### Laddningsordning

Filerna i `js/` laddas som vanliga `<script>`-filer i den ordning som står i `js/load-order.txt` (samma ordning som i `index.html`). Alla filer delar samma globala namn. En fil kan därför bara *direkt vid start* använda sådant som finns i en tidigare fil – funktioner som anropas senare (t.ex. när man trycker på en knapp) kan ligga var som helst.

`tests/check-load-order.mjs` kontrollerar detta automatiskt. Lägger du till en ny fil: lägg den i både `js/load-order.txt` och `index.html`.

## Tester

Testerna kör spelet i Chrome utan fönster och kontrollerar bland annat att alla banor går att åka i mål, att Big Air-gapen fungerar, slalom, halfpipe, tutorialen, karaktärsboxens chanser, dagens utmaning och alla online-lägen (mot en låtsasserver – inget skickas till den riktiga).

```sh
cd tests
npm install      # bara första gången
npm test         # laddningsordning + alla speltester
node run.mjs bigair online-race   # bara vissa testfall
```

Kräver Node.js och Google Chrome (eller Chromium – sätt `CHROME_PATH` om den inte hittas).

## Server (Supabase)

Global topplista, unika namn, online-lägen och dagens utmaning använder ett gratis Supabase-projekt. `supabase.sql` innehåller hela databasen och kan köras flera gånger. Spelarna loggas in anonymt och kan bara spara sina egna resultat. Utan nycklar i `config.js` fungerar allt utom online-delarna.
