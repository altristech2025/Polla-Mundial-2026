# Handoff — Polla Mundial 2026

> Estado: MVP funcional con UX completa. Falta: deploy a Vercel + cron de resultados con API real.
> Repo: https://github.com/altristech2025/Polla-Mundial-2026

---

## 🚨 Bug crítico arreglado en este commit (verificar antes de seguir)

**Síntoma:** la página devolvía 404 o entraba en loop de redirects (`/` → `/mi-polla` → `/login` → `/` → ...).

**Causa raíz:** el JWT del navegador apuntaba a un user que ya no existía en DB después de un reseed. Cada server component intentaba redirigir al "otro lado" sin invalidar el cookie.

**Fix aplicado:**
- `src/app/page.tsx`: ahora verifica que el `session.user.id` exista realmente en `users` antes de redirigir a `/mi-polla`. Si no existe, cae al login form.
- `src/app/mi-polla/page.tsx`: si el user no existe, **limpia los cookies de Auth.js** (`authjs.session-token`, `__Secure-authjs.session-token`) y redirige a `/`.
- `src/proxy.ts`: unauthenticated → `/` (no `/login`).
- `src/auth.ts`: `pages.signIn = "/"` (Auth.js no intenta redirigir a una ruta inexistente).
- `src/app/login/page.tsx`: redirect server-side a `/` (compat con bookmarks viejos).

**Verificar:** después de clonar y `npm run dev`, debe responder `200` en `/`, `/login` y `/mi-polla` (las dos primeras renderizan el login form si no estás autenticado; la tercera redirige a `/`).

---

## Stack

- **Frontend:** Next.js 16.2.6 (App Router, Turbopack, React 19.2)
- **DB:** Neon Postgres (HTTP serverless client via `@neondatabase/serverless`)
- **Auth:** Auth.js v5 con credentials provider + JWT session (no DB adapter)
- **Tailwind v4** (config en `globals.css` via `@theme inline`)
- **Idioma de UI:** Español
- **Timezone canónico:** America/Guayaquil (UTC-5)

⚠️ **Next.js 16 tiene breaking changes** vs lo que tu LLM conoce. Lee `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` antes de tocar APIs como `cookies()`, `params`, etc. (todo es async). El middleware se llama ahora `proxy.ts` y solo corre en nodejs runtime.

---

## Setup desde cero

```bash
cd polla
npm install
cp .env.example .env.local
# Editar .env.local con:
#   DATABASE_URL=postgres://... (de Neon)
#   AUTH_SECRET=$(openssl rand -base64 32)
#   AUTH_URL=http://localhost:3000  (en prod, el URL de Vercel)
npm run db:migrate
npx tsx --env-file=.env.local db/seed-participants.ts  # crea los 10 panas
npm run dev
```

El seed imprime un cuadro con `usuario | password` para los 10 panas. **Cópialos y compártelos por canal privado (WhatsApp/Signal)** — los passwords no se guardan en claro y no se pueden recuperar después.

---

## Estado por feature (qué está hecho, qué no)

### ✅ Hecho

- **Auth:** login por username + password en la landing (`/`). 10 panas pre-creados en `db/seed-participants.ts`.
- **Fase de grupos (`/mi-polla/grupos`):** los 12 grupos con sus 6 partidos cada uno (datos FIFA reales sacados de Wikipedia ES). Usuario digita marcadores. Standings se recalculan en vivo. Autoguardado debounced (800ms). Indicador "Guardando / Guardado" arriba a la derecha. Panel resumen al pie muestra quién clasifica de cada grupo y los 8 mejores terceros.
- **Bracket de eliminación (`/mi-polla/bracket`):** layout estilo "dos caminos a la copa" (7 columnas, mirror izq/der, trofeo PNG con animación float al centro). Click en equipo → propagación automática a la siguiente ronda. Picks aguas abajo se invalidan (borde rojo) si cambia algo aguas arriba.
- **Submit definitivo:** `/api/me/submit` valida los 72 marcadores + 32 picks, marca `status='submitted'` + `submitted_at`. Endpoints de edición rechazan con 403 después. UI muestra banner "✓ Pronóstico enviado" + deshabilita inputs.
- **Lock dates:** lock = **2026-06-09T23:59:00-05:00** (2 días antes del Mundial). Reveal = **2026-06-10T00:00:00-05:00** (1 día antes). Hardcoded en `app_config` (singleton row, id=1).
- **Página pública de pronósticos (`/pronosticos`):** lista de participantes con estado de pago siempre visible. Antes del reveal solo nombres + "Pagó/Sin pagar" + countdown. Después del reveal: R32 (32 equipos) + R16 (16 equipos) de cada uno en grid.
- **Leaderboard (`/leaderboard`):** tabla ordenada por `total_score`. Si aún no se revela → countdown.
- **Admin panel (`/admin`):** crear cuentas (genera username = nombre, password = nombre+3 dígitos; modal muestra credenciales 1 sola vez con botón "Copiar todo" listo para WhatsApp). Toggle "Pagó/Sin pagar". Eliminar usuarios (excepto a ti mismo). Botón "Sync resultados ahora" (placeholder hasta que conectemos API real).
- **Sistema de puntos v2 (validado con `tests/simulation.ts`):**
  - R32: **3 pts** por equipo que pasa + **2 pts adicionales** si la posición (1°, 2°, 3° mejor tercero) también coincide. Total por equipo: 3 si solo pasa, 5 si pasa en posición correcta.
  - R16: 8 / QF: 15 / SF: 25 / Final: 40
  - Campeón: 80 / Subcampeón: 40 / 3°: 25 / 4°: 15
  - Sin bonus de orden exacto (se deriva implícitamente de los picks de P101/P102/P103/P104).
  - Top 4 derivado: campeón = pick P104; subcampeón = loser P104; 3° = pick P103; 4° = loser P103.
- **Logo Altris** (`/public/logo.svg`) en todas las páginas con animación fade-in left-to-right (`@keyframes fadeInLeftToRight` en `globals.css`).
- **Trofeo PNG** (`/public/world-cup-trophy.png`) con animación float (`@keyframes trophyFloat`) + drop-shadow verde-lima.
- **Optimizaciones:**
  - `/mi-polla` consolida 5 queries en 1 con CTEs/subqueries.
  - `/api/me/group-scores` y `/api/me/bracket-picks`: batch UPSERT con UNNEST en vez de N queries por save.
  - `/api/warmup` se llama on-mount del login para despertar Neon antes de que el user apriete Entrar.
- **Validación pre-producción:** `tests/simulation.ts` corre 3 estrategias ciegas (Favorito, Caos, Mixto) contra un Mundial teórico (Argentina campeón, Brasil sub, Bélgica 3°, Francia 4°) y valida invariantes (el que acertó campeón gana, spread razonable, etc.).

### ⚠️ Pendiente / parcial

- **Cron de resultados reales:** `src/lib/sync-results.ts` está en placeholder. Para producción, conectar `football-data.org` (free tier) y `api-football.com` (fallback). Falta:
  1. Registrarse en ambos y meter las API keys en env vars (`FOOTBALL_DATA_API_TOKEN`, `API_FOOTBALL_KEY`).
  2. Implementar el fetch + normalización de nombres de equipos contra `teams.code` (ISO3).
  3. Si hay mismatch, escribir a `scores_audit` con `status='needs_admin_review'`.
  4. Configurar `vercel.json` con cron diario a 8 AM ECU (`0 13 * * *` UTC).
- **Deploy a Vercel:** no se ha hecho. Pasos: `vercel login` → `vercel` desde `polla/`. Env vars necesarias: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` (el URL del deployment). Opcional: `FOOTBALL_DATA_API_TOKEN`, `API_FOOTBALL_KEY`, `RESEND_API_KEY` para emails.
- **Tabla FIFA de allocation de terceros:** encodeada en `src/data/fifa-third-place-allocation-2026.ts` con la elegibilidad por slot (de los PDFs). El matching usa backtracking. Si FIFA libera la tabla oficial 2026, reemplazar por lookup exacto.
- **Polish móvil:** el bracket en pantallas < 1280px scrollea horizontalmente. Funciona pero hay margen para una vista colapsada por columnas en mobile. Resto de páginas ya son responsive.
- **Tour modal:** funcional pero podría ser más vivo (animaciones entre steps).

---

## Modelo de datos (Neon)

Migraciones en `db/migrations/`:
- `0001_initial_schema.sql`: tablas core (users, teams, group_matches, bracket_matches, predictions, etc).
- `0002_seed_teams_and_bracket.sql`: 48 equipos placeholder + 72 partidos round-robin + 32 cruces P73-P104 con `slot_spec` del PDF.
- `0003_payment_and_dates.sql`: agrega `users.has_paid`, actualiza fechas de lock/reveal a 9/10 jun.
- `0004_username.sql`: agrega `users.username` único case-insensitive, hace `email` opcional.

`db/reseed-real.ts` reemplaza los placeholders por equipos reales del sorteo FIFA 2026 (parseado desde Wikipedia ES — ver el script para detalles). **Ya está corrido**, los 48 equipos reales están en DB con sus banderas, fechas y estadios reales.

---

## Lógica de negocio crítica

- **`src/lib/qualification.ts`:** motor de top 2 de grupo + 8 mejores terceros + asignación a slots R32 vía tabla FIFA (backtracking). `buildR32Bracket()` devuelve las 16 R32 con teams resueltos.
- **`src/lib/tiebreakers.ts`:** `computeGroupStandings()` aplica el orden FIFA: puntos → DG → GF → duelo directo → fair play (0 en predicciones) → sorteo determinista (hash del par + seed por user, así dos usuarios con marcadores idénticos llegan al mismo standing).
- **`src/lib/scoring.ts`:** función pura `scorePrediction(pred, official) → breakdown`. No toca DB.
- **`src/lib/scoring-recompute.ts`:** llama al engine para todos los users `submitted` después de cada update de resultados oficiales. Acumula puntos en `predictions.total_score` + `score_breakdown` (jsonb).
- **`src/lib/bracket-codes.ts`:** constantes únicas de los códigos P73-P104 + layout LEFT/RIGHT del bracket visual. Importar desde aquí en todos los consumidores (no duplicar arrays de codes).

---

## Cómo agregar más usuarios

Desde el admin panel (`/admin`): "Crear cuenta" → solo pides nombre → genera username + password automáticamente → modal muestra credenciales 1 vez. Botón "Copiar todo" arma:

```
Polla Mundial 2026

Entrar en: <origin>
Usuario: <username>
Password: <password>
```

Listo para pegar en WhatsApp.

Si quieres bulk-create, edita `db/seed-participants.ts` (cuidado: borra todo y recrea — usar solo en setup inicial).

---

## Convenciones

- Server Components por default. `"use client"` solo cuando hay state/effects/handlers.
- `auth()` para session en server, `useSession()` no se usa.
- Queries: `sql\`...\`` template tag de `@neondatabase/serverless`. Para arrays, usar `any(${arr}::uuid[])` o `unnest(${arr}::text[])`.
- Constantes en `src/lib/`. Componentes de UI primitivos en `src/components/ui/`. Componentes de feature en `src/components/`.
- Estilos: Tailwind v4 con tokens en `:root` de `globals.css` (--accent, --surface, etc).

---

## Cuando arranques la siguiente sesión

1. `cd polla && git pull` + revisa el estado del repo
2. Confirma que `npm run typecheck` y `npm run dev` corren sin errores
3. **Prueba el flow de login completo** con `ernesto / ernesto<los 3 dígitos del seed>`. Si te sale 404 o redirect loop → tu cookie está stale, abre en incognito.
4. Lee este HANDOFF entero antes de tocar nada de auth, redirects o el schema de DB — son las áreas con más historial de bugs.

---

## Files críticos

```
src/auth.ts                            ← Auth.js config
src/proxy.ts                           ← middleware (route guarding)
src/lib/db.ts                          ← Neon client
src/lib/qualification.ts               ← motor torneo
src/lib/scoring.ts                     ← motor puntos
src/lib/scoring-recompute.ts           ← recálculo masivo
src/lib/tiebreakers.ts                 ← FIFA tiebreakers
src/lib/bracket-codes.ts               ← codes P73-P104 + layout
src/data/fifa-third-place-allocation-2026.ts  ← tabla oficial best-thirds

src/app/page.tsx                       ← landing + login (PUBLIC)
src/app/mi-polla/page.tsx              ← dashboard del usuario
src/app/mi-polla/grupos/                ← fase de grupos (server + client)
src/app/mi-polla/bracket/               ← bracket eliminación
src/app/pronosticos/page.tsx           ← lista pública de predicciones
src/app/leaderboard/page.tsx
src/app/admin/                          ← admin (gated por is_admin)

src/app/api/auth/[...nextauth]/route.ts
src/app/api/me/{group-scores,bracket-picks,submit,tour}/route.ts
src/app/api/admin/{users,users/paid,sync}/route.ts
src/app/api/warmup/route.ts             ← despierta Neon en login

db/migrations/                          ← schema
db/migrate.ts                           ← runner
db/seed-participants.ts                 ← seed de los 10 panas
db/reseed-real.ts                       ← seed FIFA real (ya corrido)
db/random-fill.ts                       ← prellena predicciones aleatorias para testing
tests/simulation.ts                     ← validación del sistema de puntos
```
