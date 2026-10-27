# Ski World – riktlinjer för Claude

Skidspel i 3D (Three.js r158, vanlig JavaScript utan byggsteg). Live på https://iwap.github.io/ski-world/ – en push till `main` publiceras automatiskt via GitHub Pages. Se `README.md` för mappstrukturen.

Användaren skriver på svenska: svara på svenska.

## Hur koden är byggd

- **Vanliga `<script>`-filer som delar globala namn.** Ordningen står i `js/load-order.txt` och måste vara exakt samma i `index.html`. En fil får bara *vid laddning* använda sådant som en tidigare fil deklarerat (funktioner som anropas senare får ligga var som helst). `const`/`let` på toppnivå har TDZ – använd dem inte innan de deklarerats. Ny fil = lägg till i båda listorna.
- **Varje fil** börjar med `'use strict';` och en kommentarsrad om vad den innehåller. Kommentarer och namn i koden är på svenska, i samma stil som omgivande kod.
- **Texter i gränssnittet** går alltid via `t('nyckel')` i `i18n.js`, med översättning på alla fyra språken (sv, en, es, nl). Text från andra spelare sätts med `textContent`, aldrig `innerHTML`.
- **Inga nya beroenden eller byggverktyg.** Tredjepartsfiler ligger i `vendor/` eller laddas med exakt version.

### Världen (backen)
- Allt som påverkar hur backen genereras går genom `spawnUntil()` / `makeObject()` i `js/world/`. Under generering byts `Math.random` mot `worldRng` (mulberry32) så att samma frö ger exakt samma backe – det används av race, dagens utmaning och spöken. **Använd aldrig något annat slumpmässigt eller tidsberoende i genereringen**, och låt den inte bero på spelarens position eller val (utom via `worldStats()`).
- `worldStats()` ger farten/hoppkraften som landningarna räknas från: spelarens värden för ett vanligt åk (sparas i `runSeed` och följer med spöket), grundvärden i race och dagens utmaning.
- **Hopp är terräng** (`features` i `js/world/shape.js`): kicker → bord → knuckle → landning i en och samma snöbyggnad, byggd i `makeLanding()`. Svårighet enligt `RAMPS[].grade`: grönt, blått, rött – svart bara på Big Air-banan. Varje hopp har en skylt och en kantlinje i sin färg.
- **Inget får stå inuti något annat.** Allt som placeras måste klara `collides(o)` (cirklar/rektanglar i `js/world/world.js`) utöver de äldre reglerna (`overlaps`, `blockedByLinear`, `inLandingZone`). Något som hör till ett hopp (t.ex. railen på landningen) markeras med `o.jump = hoppet`. Testet `tests/cases/overlaps.js` bygger alla banor med flera frön och ska alltid ge noll överlapp.

### Spelregler som användaren har bestämt
- Banpriser och belöning: `COURSE_PRICE` / `COURSE_REWARD` i `js/data/courses.js`. Poängen skalas med `SCORE_SCALE` (0,4) och `TRICK_SCALE` (Big Air och halfpipe ger en tredjedel för tricks).
- Banpriserna ökar med 3 000 per bana. `COURSE_POINTS`: poäng ×2 på alla banor utom halfpipe (×1,5). Klarar man hela banan dubblas poängen för åket (`FINISH_MULT`). Karaktärsboxen kostar 5 000.
- Off-pist (bara där): 25 % långsammare (`speed: 0.75`), halva längden (`lengthMult`), smal (`netX: 18`) med rep istället för nät, tät skog, pudersnö (`powder`), små puckar överallt (`lumps`), inga byggda hopp eller räcken – bara fallna träd (`log`), naturliga snöpuckar (`bump`) och ibland en klippa över hela bredden (`cliff`, 2–12 m). Ibland en liten stuga (`hut`) i landningen efter en klippa eller puck – man kan landa och åka på taket.
- Slalomportarna är vanliga slalomkäppar (röda och blå) utan flaggor.
- Halfpipen: 1,5 gånger så hög luft (`PIPE_LIFT`) och mer förlåtande landningar.
- Tricks i luften: ← → snurr, ↑ ↓ volt, G cork 360 (ett varv medan kroppen lutar ut ~125°, över huvudet), F R V Q grabs (Mute grab är borttagen). Nya tricks ska med i tutorialen.
- Ingen slowmotion. Volt-cooldown 0,25 s, kedjan nollställs efter 3 s utan nytt trick.
- Vinnaren av ett race får 1,5 gånger pengarna (`RACE_WIN_MULT`). Namn är unika och minst 3 tecken.
- Tutorialen visas bara första gången någonsin.
- Tomtens presenter (`js/online/presents.js`): var 15:e minut 100 presenter, lika många per bana, samma platser för alla. Servern (`claim_present`) avgör vem som var först – 500 pengar. Presenterna får aldrig påverka hur backen byggs (de ignoreras av `collides`/`overlaps`) och visas bara när servern har svarat.
- Stugor: landar man rakt åker man på taket, landar man snett grindar man längs nocken.

## Tester

```sh
cd tests && npm install && npm test   # laddningsordning + alla testfall i Chrome utan fönster
node run.mjs ghosts overlaps          # bara vissa testfall
```

- Kör `npm test` före varje push. Lägg till eller uppdatera ett testfall i `tests/cases/` när du ändrar beteende – särskilt för buggar (testa att testet faktiskt fångar buggen).
- Testfall som börjar med `online-` kör mot en låtsasserver (`tests/lib/mock-supabase.js`). Inga tester får skicka något till den riktiga servern.
- Titta på resultatet också: ta en skärmdump med headless Chrome (`--screenshot`) av sådant som syns.

## Server (Supabase) – säkerhet först

- Projekt `utbeyebqsmtjwuuplzck` (gratisplanen). **Användaren vill inte kunna få kostnader:** inga betaltillägg, ingen planändring.
- Bara den publika anon-nyckeln får finnas i koden (`config.js`). Aldrig service_role-nyckel, databaslösenord eller CLI-token – och läs inte användarens token/nyckelring.
- `supabase.sql` är hela databasen och ska gå att köra flera gånger. Alla skrivningar sker som inloggad (anonym) spelare: RLS, egna rader via `auth.uid()`, skrivande funktioner är `security definer` med kontroller och `revoke` från `anon`, och gränser mot spam/stora data.
- Ändringar körs med Supabase CLI från en tillfällig mapp (`supabase link --project-ref utbeyebqsmtjwuuplzck`, sedan `supabase db query --linked -f fil.sql`) och kontrolleras med `supabase db advisors --linked`. Testa regler i en transaktion som rullas tillbaka; ta aldrig bort annat än namngivna testrader.

## Git
- Committa och pusha när testerna går igenom och användaren har bett om ändringen (pushen publicerar direkt). Commit-meddelanden på engelska.
