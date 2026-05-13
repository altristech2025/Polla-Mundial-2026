# Handoff — Polla Mundial 2026

> Estado: en producción en Vercel. UX endurecida. Falta cron de resultados con API real cuando arranque el Mundial.
> Repo: https://github.com/altristech2025/Polla-Mundial-2026
> Live: https://polla-mundial-2026-altris.vercel.app

---

## 📦 Sesión 2026-05-13 — resumen

Cambios funcionales y deploy a producción.

**UX endurecida:**
- Modal de envío con doble confirmación: checkbox "entiendo que no podré editar" + escribir literalmente la palabra **ENVIAR** para habilitar el botón. Extraído a [`src/components/submit-confirm-modal.tsx`](src/components/submit-confirm-modal.tsx). Casi imposible enviar por error.
- CTA "Enviar pronóstico definitivo" agregado al fondo de [`src/app/mi-polla/bracket/bracket-client.tsx`](src/app/mi-polla/bracket/bracket-client.tsx) usando el mismo modal — el usuario ya no tiene que volver a `/mi-polla` paso 3 para enviar.
- Tour modal ([`src/components/tour-modal.tsx`](src/components/tour-modal.tsx)): borrado el paso "Orden final top 4" (ya no aplica — top 4 se deriva de los picks P103/P104). 5 pasos → 4 pasos. Al click en "No, gracias" aparece despedida grande **"bueno shunsho, espero lo logres!!!"** con animación de entrada (`@keyframes tourFarewell` en `globals.css`).

**Tracking público del Mundial:**
- Nueva página [`/resultados`](src/app/resultados/page.tsx) (server component). Gobernada por `app_config.tournament_start_at`:
  - **Fase A** (pre-kickoff): countdown + sección "Quién debe" listando no-pagadores. Grid de tracking vacío. Aunque un usuario haya hecho submit, no se revela nada.
  - **Fase B** (post-kickoff): grid 12 grupos × 3 slots × N pagadores. Cada pagador tiene dos sub-columnas (Predicho | Real). Slot 3 ("mejor tercero") solo se llena si la predicción/realidad lo deriva. Live projection: la columna Real se ordena como standings parciales según los partidos jugados. Footer con puntos por pagador. Ranking 1-10 al fondo.
- **Regla dura:** solo pagadores (`users.has_paid = true`) tienen columna en la grilla y participan del ranking. Los no-pagadores solo aparecen en la sección "Quién debe".
- Reuso de `computeGroupStandings` ([`src/lib/tiebreakers.ts`](src/lib/tiebreakers.ts)) y `determineBestThirds` ([`src/lib/qualification.ts:50`](src/lib/qualification.ts#L50)) para predicho y real.
- Links de nav agregados desde `/mi-polla` y `/pronosticos`.

**Polish visual:**
- Trofeo: el PNG original era 2752×1536 landscape con franjas negras enormes a los costados y una marca de agua. Recortado con `sips -c 1450 870 --cropOffset 40 940` a 870×1450 portrait apretado, sin marca de agua. Renderiza mucho mejor en `/mi-polla/bracket`.
- Landing ([`src/app/page.tsx`](src/app/page.tsx)): sección de pago con **QR de Deuna** (`public/qr-deuna.jpeg`) debajo del login. Copy: "Pago de la polla — Escanea para pagar por Deuna".

**Deploy:**
- Live en `https://polla-mundial-2026-altris.vercel.app` (alias `*-gamma.vercel.app` también funciona).
- Ver sección "Producción / Vercel" abajo para env vars y gotchas del primer deploy.

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
- **Submit definitivo:** `/api/me/submit` valida los 72 marcadores + 32 picks, marca `status='submitted'` + `submitted_at`. Endpoints de edición rechazan con 403 después. UI muestra banner "✓ Pronóstico enviado" + deshabilita inputs. **Modal de confirmación endurecido**: checkbox "entiendo" + escribir literalmente `ENVIAR`. Componente compartido en `src/components/submit-confirm-modal.tsx`, usado desde `/mi-polla` paso 3 y desde el CTA al fondo de `/mi-polla/bracket`.
- **Lock dates:** lock = **2026-06-09T23:59:00-05:00** (2 días antes del Mundial). Reveal = **2026-06-10T00:00:00-05:00** (1 día antes). Hardcoded en `app_config` (singleton row, id=1).
- **Página pública de pronósticos (`/pronosticos`):** lista de participantes con estado de pago siempre visible. Antes del reveal solo nombres + "Pagó/Sin pagar" + countdown. Después del reveal: R32 (32 equipos) + R16 (16 equipos) de cada uno en grid.
- **Página de resultados (`/resultados`):** tracking público del Mundial. Gobernada por `app_config.tournament_start_at`. Fase A (pre-kickoff): "Quién debe" + countdown, sin revelar pronósticos. Fase B (post-kickoff): grid 12 grupos × 3 slots × N pagadores con sub-columnas Predicho | Real, puntos por columna y ranking 1-10 al fondo. **Solo pagadores participan**; no-pagadores aparecen solo en la lista de "Quién debe".
- **Leaderboard (`/leaderboard`):** tabla ordenada por `total_score`. Si aún no se revela → countdown.
- **Admin panel (`/admin`):** crear cuentas (genera username = nombre, password = nombre+3 dígitos; modal muestra credenciales 1 sola vez con botón "Copiar todo" listo para WhatsApp). Toggle "Pagó/Sin pagar". Eliminar usuarios (excepto a ti mismo). Botón "Sync resultados ahora" (placeholder hasta que conectemos API real).
- **Sistema de puntos v2 (validado con `tests/simulation.ts`):**
  - R32: **3 pts** por equipo que pasa + **2 pts adicionales** si la posición (1°, 2°, 3° mejor tercero) también coincide. Total por equipo: 3 si solo pasa, 5 si pasa en posición correcta.
  - R16: 8 / QF: 15 / SF: 25 / Final: 40
  - Campeón: 80 / Subcampeón: 40 / 3°: 25 / 4°: 15
  - Sin bonus de orden exacto (se deriva implícitamente de los picks de P101/P102/P103/P104).
  - Top 4 derivado: campeón = pick P104; subcampeón = loser P104; 3° = pick P103; 4° = loser P103.
- **Logo Altris** (`/public/logo.svg`) en todas las páginas con animación fade-in left-to-right (`@keyframes fadeInLeftToRight` en `globals.css`).
- **Trofeo PNG** (`/public/world-cup-trophy.png`) con animación float (`@keyframes trophyFloat`) + drop-shadow verde-lima. Recortado de 2752×1536 (con franjas negras y marca de agua) a 870×1450 portrait apretado vía `sips` el 2026-05-13.
- **QR de Deuna** en la landing (`/public/qr-deuna.jpeg`) debajo del login form, para que los panas paguen sin necesidad de que Ernesto les mande el QR por WhatsApp uno a uno.
- **Tour modal** (`src/components/tour-modal.tsx`): 4 pasos (eliminado el viejo "Orden final top 4" — el top 4 se deriva ahora de P103/P104). Skip a "No, gracias" muestra despedida grande "bueno shunsho, espero lo logres!!!" con bounce-in (`@keyframes tourFarewell`).
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
- **Expandir `/resultados` con rondas eliminatorias.** Hoy la grilla solo muestra los 32 que pasan de fase de grupos (12 grupos × 3 slots). Falta agregar más secciones de filas para mostrar predicho-vs-real de:
  - **R16** (16 picks: ganadores de cada cruce P73–P88).
  - **Cuartos / R8** (8 picks: ganadores de octavos).
  - **Semis** (4 picks).
  - **Final**: campeón + subcampeón.
  - **Tercer puesto**: 3° + 4°.
  Para "predicho" se lee de `prediction_bracket_picks`; para "real" de `bracket_matches.official_winner_id / official_loser_id`. Mantener el mismo patrón visual (sub-columnas Predicho | Real por pana).
- **Total agregado por pana ordenado por puntaje.** Hoy las columnas se ordenan alfabéticamente siempre. Cambiar a:
  - Antes del kickoff (`now < tournament_start_at`): orden alfabético por `display_name`.
  - Después del kickoff: orden **descendente por `predictions.total_score`**, con tiebreaker alfabético. El "ranking" se ve directo en las columnas (el primero a la izquierda), redundante con la sección de ranking de abajo pero útil para escanear.
  Cambio puntual en la query inicial de `src/app/resultados/page.tsx` (el `order by u.display_name asc`).
- **Tabla FIFA de allocation de terceros:** encodeada en `src/data/fifa-third-place-allocation-2026.ts` con la elegibilidad por slot (de los PDFs). El matching usa backtracking. Si FIFA libera la tabla oficial 2026, reemplazar por lookup exacto.
- **Polish móvil:** el bracket en pantallas < 1280px scrollea horizontalmente; la grilla de `/resultados` también scrollea horizontalmente cuando hay varios pagadores. Funciona pero hay margen para una vista colapsada (tabs por participante) en mobile. Resto de páginas ya son responsive.
- **Monto en QR Deuna:** la sección de pago en la landing dice "Escanea para pagar por Deuna" sin monto explícito. Si quieres mostrar el monto del bolo, hardcodearlo en `src/app/page.tsx`.

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

## Producción / Vercel

Live: **https://polla-mundial-2026-altris.vercel.app** (alias canónico de Vercel para el proyecto en el team `altris`). El deployment ID y URLs específicas cambian con cada push; el alias se mantiene.

### Setup que se hizo el 2026-05-13

```bash
npm i -g vercel
vercel whoami   # altristech
cd polla
vercel project add polla-mundial-2026   # scope: altris
vercel link --yes --project polla-mundial-2026 --scope altris
# env vars (production):
echo -n "$DATABASE_URL"     | vercel env add DATABASE_URL production
echo -n "$AUTH_SECRET"      | vercel env add AUTH_SECRET production
echo -n "true"              | vercel env add AUTH_TRUST_HOST production
vercel deploy --prod --yes
```

### Env vars en producción

- `DATABASE_URL` — el mismo Neon connection string que usa local. La DB es compartida entre prod y local (mismo schema, mismos usuarios, mismas predicciones).
- `AUTH_SECRET` — el mismo de `.env.local`. **Crítico** que sea idéntico o invalida sesiones existentes.
- `AUTH_TRUST_HOST=true` — Auth.js v5 infiere el host del request. Esto sustituye a `AUTH_URL`, que en local apunta a `http://localhost:3000`. Con `AUTH_TRUST_HOST` no hace falta setear un URL fijo para prod.
- (no se setean) `TOURNAMENT_START_ISO`, `PREDICTIONS_LOCK_ISO` — no se usan en código. Las fechas canónicas están en la tabla `app_config`.

### Gotchas del primer deploy

- **Framework auto-detection no funciona** cuando creas el proyecto vía `vercel project add` (API). Hay que setearlo manualmente. Sin `framework: "nextjs"` Vercel construye los assets pero el routing devuelve `x-vercel-error: NOT_FOUND` en todas las rutas. Fix vía API:
  ```bash
  curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
    -d '{"framework": "nextjs"}' \
    "https://api.vercel.com/v9/projects/polla-mundial-2026?teamId=$TEAM_ID"
  ```
  Después de eso, `vercel deploy --prod --force` y todo funciona.
- **SSO Deployment Protection viene activada por default** en proyectos de teams pagos (`deploymentType: all_except_custom_domains`). Esto gateaba el sitio detrás del login de Vercel — los panas no pueden ver nada. Se deshabilitó vía API:
  ```bash
  curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
    -d '{"ssoProtection": null}' \
    "https://api.vercel.com/v9/projects/polla-mundial-2026?teamId=$TEAM_ID"
  ```
- **Vercel CLI auth token** se guarda en `~/Library/Application Support/com.vercel.cli/auth.json` en macOS.

### Plan / hosting tier

Proyecto está en team `altris` (plan pagado). La app cabe perfectamente en Hobby (10 usuarios, tráfico marginal, ~1.5 meses de uso pico junio-julio). Si se quiere mover a Hobby para no consumir asiento del team Altris:

1. Settings → Advanced → "Transfer Project" desde la web de Vercel.
2. Transferir a la cuenta personal de Ernesto.
3. Mantiene deployment, dominio y history. Cero downtime.

Riesgo de ToS en Hobby para este uso: virtualmente cero (10 amigos, plata afuera de Vercel via Deuna). El sitio corporativo de Altris (que captura leads) sí cae en "commercial use" y debería quedarse en plan pagado o moverse a Cloudflare Pages.

---

## Seguridad anti-bugs en producción (qué hacer si encuentras bugs después de que los panas hayan enviado)

**Regla de oro:** la predicción cruda (`prediction_group_scores` + `prediction_bracket_picks`) es fuente de verdad. Todo lo demás — standings, R32, R16, puntos, ranking — se deriva en runtime o se recalcula con `recomputeAllScores()`. La mayoría de los bugs viven en el pipeline de derivación, no en la data guardada.

### Por tipo de bug

1. **Bug de display o cálculo (95% de los casos):** editas → `git push` → `vercel deploy --prod --yes`. Si tocaste scoring, después corres:
   ```bash
   npx tsx --env-file=.env.local -e "
   import { recomputeAllScores } from './src/lib/scoring-recompute';
   recomputeAllScores().then(() => console.log('done'));
   "
   ```
   Data del pana: intacta. Solo se recalcula `predictions.total_score` y `predictions.score_breakdown`.

2. **Un pana específico necesita corregir su predicción** (ej: "me equivoqué al darle Enviar"): desbloquear quirúrgicamente sin tocar a nadie más:
   ```sql
   update predictions set status='draft', submitted_at=null where user_id='<uuid>';
   ```
   El pana entra a la app, edita, vuelve a darle submit (con modal y `ENVIAR`). Hacerlo con discreción — si lo haces para uno, todos van a querer.

3. **Data corrupta masiva (raro, peor caso):**
   - **Plan A — Neon PITR:** Neon free tier graba 24h de changelog. Consola Neon → Restore → eliges timestamp justo antes del bug → restauras a un nuevo branch → validas → promueves o copias rows con `INSERT ... SELECT` cross-branch.
   - **Plan B — SQL quirúrgico:** si solo se afectaron ciertas rows y sabes qué deberían tener, script puntual + `npx tsx --env-file=.env.local`.

### Setup defensivo recomendado (cero costo) antes del lock date (9-jun)

Mientras no haya submits, hacer lío en local no rompe nada. Una vez que los panas empiecen a enviar (status='submitted'), conviene tener:

1. **Neon dev branch (FREE):** consola Neon → Branches → Create branch → "dev" desde `main`. Te da connection string aparte; lo pegas en `.env.local`. Local apunta a `dev`, prod sigue en `main`. Si corres `random-fill.ts` o `db:migrate` localmente, no jodes la data de los panas. Para sincronizar schema cuando agregas migración: la corres en `dev`, validas, después con `DATABASE_URL` apuntando a `main` corres la misma migración.

2. **Audit log table (FREE, 1 migración):**
   ```sql
   create table audit_log (
     id uuid primary key default gen_random_uuid(),
     happened_at timestamptz default now(),
     actor_user_id uuid references users(id),
     action text,
     target_user_id uuid references users(id),
     details jsonb
   );
   ```
   + Triggers en `prediction_group_scores` y `prediction_bracket_picks` que registren updates/deletes después del lock. Si después alguien dice "esto no lo puse así", hay registro.

3. **Endpoint admin "desbloquear submit" (FREE, ~10 líneas):** botón en `/admin` que llame a un endpoint que pone `status='draft'` + registra en `audit_log`. Evita que tengas que entrar a Neon con SQL cuando un pana pide corrección.

4. **Backup manual antes de algo arriesgado:**
   ```bash
   pg_dump "$DATABASE_URL" > "backup-$(date +%Y%m%d-%H%M).sql"
   ```
   Se queda en tu máquina, no en cloud, gratis. Hacerlo antes de cualquier migración, recompute masivo, o experimento raro.

### Lo que NO recomiendo gastar plata

- Neon Launch ($19/mes) para 7-30 días de PITR — para uso lúdico, el free de 24h alcanza.
- Backups automáticos a S3 — pg_dump manual antes de operaciones riesgosas es suficiente.
- Vercel Pro para el polla — Hobby alcanza (la app vive en team `altris` Pro hoy pero solo porque ya estaba pagado para Altris empresa).

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

1. `cd polla && git pull` + revisa el estado del repo.
2. Confirma que `npm run typecheck` y `npm run dev` corren sin errores.
3. **Prueba el flow de login completo** con `ernesto / ernesto<los 3 dígitos del seed>` (password de Ernesto al cierre de la sesión 2026-05-13: `ernesto921` — si reseed, cambia). Si te sale 404 o redirect loop → tu cookie está stale, abre en incognito.
4. Para cambios en producción: edita, commitea, `git push origin main`, `vercel deploy --prod --yes` desde `polla/`. El CLI ya está linkeado (`.vercel/project.json` gitignored). DB es compartida con local — los cambios de schema afectan ambos ambientes.
5. Lee este HANDOFF entero antes de tocar nada de auth, redirects o el schema de DB — son las áreas con más historial de bugs.

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

src/app/page.tsx                       ← landing + login + QR Deuna (PUBLIC)
src/app/mi-polla/page.tsx              ← dashboard del usuario
src/app/mi-polla/grupos/                ← fase de grupos (server + client)
src/app/mi-polla/bracket/               ← bracket eliminación + CTA de submit al fondo
src/app/pronosticos/page.tsx           ← lista pública de predicciones (post-reveal)
src/app/resultados/page.tsx            ← tracking público del Mundial (pre/post kickoff)
src/app/leaderboard/page.tsx
src/app/admin/                          ← admin (gated por is_admin)

src/components/submit-confirm-modal.tsx ← modal compartido (checkbox + ENVIAR)
src/components/tour-modal.tsx           ← tour 4 pasos + despedida shunsho

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
