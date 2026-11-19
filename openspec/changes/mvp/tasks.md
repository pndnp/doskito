# Tasks

## 0. Инициализация проекта

- [ ] 0.1 Настроить для `server/` и `client/` ESLint с TypeScript-правилами, Prettier и Stylelint для CSS/SCSS; добавить корневые Husky + lint-staged и pre-commit hook, который запускает `eslint --fix`, `stylelint --fix` и `prettier --write` только для staged TS/TSX/CSS/SCSS-файлов соответствующего пакета, повторно добавляет автоисправления в index и блокирует commit при оставшихся ошибках; проверить hook на тестовых staged-файлах бэкенда и фронтенда, зафиксировать точные версии зависимостей без `^`/`~`

## 1. Project Setup & Infrastructure

- [ ] 1.1 Создать `server/` с Fastify + TypeScript + Prisma + Zod и скриптами dev/build/migrate/lint/test; создать `client/` с Vite + React + TypeScript и скриптами dev/build/lint/test
- [ ] 1.2 Установить TanStack Query, dnd-kit, axios, date-fns, lucide-react и react-router-dom; зафиксировать точные версии всех зависимостей без `^`/`~`
- [ ] 1.3 Создать `.env.example`: `DATABASE_URL=file:./data/doskito.db`, `NEURALDEEP_API_URL`, `NEURALDEEP_API_KEY`, `NEURALDEEP_MODEL`, `ADMIN_SECRET`, `CORS_ORIGIN`, `PORT=3001`, `VITE_API_URL`; не добавлять реальные секреты
- [ ] 1.4 Создать multi-stage `server/Dockerfile` и `client/Dockerfile`, `.dockerignore`, базовый `compose.yaml`, `compose.dev.yaml`, `compose.prod.yaml`; закрепить Node LTS/base images и использовать `npm ci`
- [ ] 1.5 Настроить dev-запуск одной командой `docker compose -f compose.yaml -f compose.dev.yaml up --build`: UI на 5173 с HMR, API на 3001, Vite proxy `/api` → `http://server:3001`, bind mounts исходников и отдельные volumes для node_modules
- [ ] 1.6 Настроить bind mount `./data:/app/data` для SQLite в dev и production, `data/doskito.db` на хосте, права non-root UID, `.gitignore` для БД; автоматический `prisma migrate deploy` перед стартом server, healthchecks server/client и graceful stop
- [ ] 1.7 Настроить production-like `docker compose -f compose.yaml -f compose.prod.yaml up --build` на localhost:8080: nginx раздаёт client build, проксирует API/SSE без buffering, блокирует `/admin/*`, публикует только web-порт на 127.0.0.1
- [ ] 1.8 Добавить Compose test-профиль для server/client unit/integration и Playwright E2E с временными SQLite БД, отдельным каталогом данных и project name; добавить единую команду проверки lint/format/typecheck/build/tests/healthchecks
- [ ] 1.9 Задокументировать в README локальные команды Docker, пересоздание миграций в dev, запуск production-like и перенос на VPS с env; описать host-каталог `data/`, SQLite backup API и restore, запрет публикации данных через nginx; секреты не включать в images/Vite bundle

## 2. Database Schema (Prisma)

- [ ] 2.1 Описать Board (`slug`, `name`, `color`, columns JSON TEXT, timestamps, `deleted_at`), Task, BoardUser и ParsedDraft; SubTask не создавать
- [ ] 2.2 Добавить Task поля title/status/priority/dueDate/tags JSON TEXT/order/timestamps и индексы `(boardId,status,order)`, `(boardId,id)`
- [ ] 2.3 Добавить ParsedDraft поля clientId/rawText/parsedFields/status/expiresAt/finalizedTaskIds JSON TEXT/timestamps; UNIQUE `Board.slug`, UNIQUE `(boardId,name)` BoardUser, индексы `(status,expiresAt)` и `updatedAt`
- [ ] 2.4 Выполнить `prisma migrate dev --name init`; integration-проверить создание SQLite, ограничения уникальности и каскадное удаление связанных записей

## 3. Fastify Server Core

- [ ] 3.1 Настроить CORS whitelist, body limit 500KB, rate limit 100 req/min/IP, порт из env, graceful shutdown и `$disconnect` Prisma
- [ ] 3.2 Реализовать генератор slug через `crypto.randomInt` с collision retry и deterministic `hashColor()` в HSL; unit-тесты формата и детерминизма
- [ ] 3.3 Реализовать серверный `clientId` в HttpOnly SameSite cookie и общие Zod-схемы Board/Task/Draft, единый error handler 400/404/401/409/503
- [ ] 3.4 Реализовать транзакционный helper обновления `Board.updated_at` и unit/integration-тесты правил активности

## 4. Board Management API

- [ ] 4.1 Реализовать `POST /api/boards` (201) с именем «Моя доска», цветом, slug/url и колонками «Сделать», «Делаю», «Готово»
- [ ] 4.2 Реализовать `GET /api/boards/:slug`: полное состояние, сортировка, drafts только текущего clientId и единый 404 для missing/deleted
- [ ] 4.3 Реализовать `PATCH /api/boards/:slug` для имени 1–80 символов, обновление activity и SSE `board_updated`
- [ ] 4.4 Реализовать `DELETE /api/boards/:slug`: транзакционный soft delete Board + hard delete связей, 204, SSE `board_deleted(manual)`, повторный 404
- [ ] 4.5 Реализовать `POST /api/boards/:slug/join` с trim/1–40, upsert 200/201, цветом и SSE только для нового участника
- [ ] 4.6 Реализовать `POST /api/boards/summaries` до 100 slug с metadata/counts/missingSlugs без изменения activity
- [ ] 4.7 Реализовать суточный cleanup условием `updated_at < now() - 30 дней`, общий deletion service и `board_deleted(inactivity)`; тесты границы cutoff
- [ ] 4.8 Реализовать `GET /admin/boards` с `X-Admin-Secret` из env, активными и удалёнными досками; тесты 401/200

## 5. AI Parse & Drafts API

- [ ] 5.1 Реализовать LLMProvider и NeuralDeep `/chat/completions`: env key/model, system/user messages, JSON response format, timeout и response-size limit
- [ ] 5.2 Реализовать максимум 2 attempts для network/timeout/5xx/invalid JSON с error feedback и экспоненциальной задержкой; логировать latency/token usage без rawText и секретов
- [ ] 5.3 Реализовать Zod-нормализацию: обязательный title, priority fallback medium, dueDate fallback null, tags limits, 0–10 subTasks и признак усечения
- [ ] 5.4 Реализовать `POST /api/boards/:slug/tasks/parsed`: rawText 1–500, PENDING с clientId/expiresAt, 201 с draftId/parsedFields/expiresAt, 400 и 503 по контракту
- [ ] 5.5 Реализовать `PATCH /api/boards/:slug/drafts/:draftId` полным parsedFields с валидацией title 1–200, 0–10 subTasks и owner/PENDING/TTL checks
- [ ] 5.6 Реализовать идемпотентный `POST .../drafts/:draftId/finalize`: транзакционно основная Task + 2–10 самостоятельных Tasks, наследование priority/dueDate/tags, finalizedTaskIds и повторный 200 без дублей
- [ ] 5.7 Реализовать `POST .../drafts/:draftId/discard`, owner-only SSE `draft_discarded(manual)` и минутный TTL cleanup с `expired`
- [ ] 5.8 Integration-тесты: 0/1/2/10/11 AI-подзадач, invalid priority/date/title, двойной finalize, чужой clientId, expired/discarded draft, rollback транзакции и LLM 503

## 6. Task Board API

- [ ] 6.1 Реализовать `POST /api/boards/:slug/tasks` с ручным созданием во всех статусах, серверным order, 201 и SSE `task_created`
- [ ] 6.2 Реализовать `PATCH /api/boards/:slug/tasks/:taskId` для title/status/priority/dueDate/tags/order, валидацию и полный task в `task_updated`
- [ ] 6.3 Реализовать `DELETE /api/boards/:slug/tasks/:taskId` с 204 и `task_deleted`; проверить 404 для missing/чужой доски
- [ ] 6.4 Integration-тесты всех enum/date/tag/title ограничений, ordering, last-write-wins и обновления board activity

## 7. SSE Real-time Sync

- [ ] 7.1 Реализовать subscribers store `(boardSlug,clientId) -> Set<Response>`, broadcast/public/owner-only, heartbeat 15s и cleanup close/write error
- [ ] 7.2 Реализовать `GET /api/boards/:slug/sse` с 404 до открытия, headers, `retry: 3000`, `ready`, монотонными event ids и корректным JSON formatting
- [ ] 7.3 Публиковать после commit все task/board/user/draft события; закрывать потоки после board_deleted; ошибка одного subscriber не откатывает mutation
- [ ] 7.4 Тесты heartbeat/cleanup, owner-only drafts, отсутствие duplicate user_joined, все payload и закрытие при удалении

## 8. Frontend Foundation, Welcome & Boards UI

- [ ] 8.1 Настроить HashRouter (`/`, `/:slug`), TanStack Query/axios с `VITE_API_URL`, credentials для clientId, общие toast/error/loading components
- [ ] 8.2 Реализовать типобезопасный `useBoardsStore` для `doskito_boards`: массив metadata objects, corrupted JSON/storage errors, add/update/remove без потери данных при offline
- [ ] 8.3 Реализовать Welcome строго по `design/screens/welcome.html`: H1 «Создайте доску», описание 17px, CTA 60px, pills, pop/bob/reduced motion
- [ ] 8.4 Реализовать Boards UI: instant cached cards → summaries refetch, missing cleanup, stale-data message, 3/2/1-column responsive grid
- [ ] 8.5 Реализовать общий create/open flow: создание → сохранение → `/#/:slug`; валидация URL/slug, GET перед сохранением, отдельные 404/network errors
- [ ] 8.6 Реализовать карточки с именем/инициалом/цветом, прогрессом, relative time, «Скопировать ссылку» и feedback; Clipboard fallback при отказе API
- [ ] 8.7 Реализовать меню `···`: rename, DELETE и «Убрать из списка» только локально; перед DELETE показывать warning modal «Удалить доску для всех?» с последствиями, safe default focus, блокировкой repeat и error retry; добавить дисклеймер 30 дней и dashed create card
- [ ] 8.8 Компонентные тесты Welcome-vs-list, создания, вставки ссылки, повреждённого localStorage, offline summaries, copy и обоих видов удаления

## 9. Frontend Kanban & Empty Board

- [ ] 9.1 Реализовать BoardView с board state, шапкой/именем/rename, progress/ARIA, invite modal, участниками, join и SSE status; добавить действие удаления доски с тем же общим предупреждением «Удалить для всех»
- [ ] 9.2 Реализовать Empty Board по `design/screens/empty-board.html`: save-link banner с persisted dismiss, copy, examples → input, «Пока нет задач» и empty drop zones
- [ ] 9.3 Реализовать QuickAdd input + «Разобрать»/Enter, 500-char limit, блокировку двойного submit, spinner, 503 toast и ручной fallback
- [ ] 9.4 Реализовать TaskCard без вложенного прогресса: локализованный priority, tags, dueDate/no-date, overdue по локальному дню, меню edit/move/delete
- [ ] 9.5 Реализовать формы ручного создания из колонки и редактирования/подтверждения удаления задачи с loading/error/validation
- [ ] 9.6 Повторить цвета/типографику/отступы board и add-task макетов, animations pop/rise/grow, responsive и `prefers-reduced-motion`

## 10. AI Preview, DnD & Optimistic Updates

- [ ] 10.1 Реализовать AiPreview по `design/screens/board-add-task.html`: select priority, native date input, tags editor, 0–10 subtask inputs без чекбоксов, add/remove и blocked background
- [ ] 10.2 Реализовать последовательное PATCH draft → finalize по «Сохранить на доску», discard по «Отмена», restore PENDING после reload и сохранение ввода при ошибках; обработать гонку TTL через refetch board state и закрытие недоступного черновика
- [ ] 10.3 Реализовать DndContext для status/order, drop highlights, instant update и keyboard-friendly fallback «Переместить в…»
- [ ] 10.4 Реализовать общий TanStack optimistic helper cancel/snapshot/set/rollback/invalidate для create/update/delete/move без гонок SSE
- [ ] 10.5 Реализовать `useSSE` с `withCredentials: true`: все события, инвалидация только текущей доски, ready/reconnect refetch board state и PENDING drafts, owner draft notifications, unmount cleanup и terminal board_deleted
- [ ] 10.6 После board_deleted/404 удалить slug локально, закрыть SSE и показать экран «Доска удалена или недоступна» с пояснением о ручном/30-дневном удалении и возвратом к списку

## 11. End-to-End Verification

- [ ] 11.1 E2E: Welcome → create → empty board/save link → rename → AI parse → edit draft → finalize → независимые tasks → manual create/edit/delete
- [ ] 11.2 E2E двух вкладок: join, move/order, rename, rollback, reconnect, owner-only drafts; подтвердить delete board во второй вкладке и проверить warning, отмену без DELETE, ошибку/retry и terminal экран у другого участника
- [ ] 11.3 E2E Boards UI: copy/invite links, open valid/invalid URL, remove locally vs server delete, persisted banner и localStorage между сессиями
- [ ] 11.4 Выполнить в Docker production build, lint, format check, typecheck, unit/integration/E2E tests и healthchecks; проверить responsive 320/768/1280px, keyboard flows и reduced motion
- [ ] 11.5 Запустить production-like Compose и E2E через nginx: SSE reconnect/heartbeat, `/admin/*` denied, API proxy, `up --build`/`down`/restart с сохранением `./data/doskito.db` на хосте и недоступностью файла БД по HTTP; затем `openspec validate mvp --strict` и сверка пяти макетов из `design/screens/` (welcome, empty-board, board, board-add-task, boards-list)
