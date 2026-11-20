# Doskito

**Минималистичный совместный Kanban-трекер с AI-разбором задач.**

Формулируйте задачи как в заметках — ИИ автоматически разобьёт их на подзадачи, задаст приоритет, дедлайн и теги. Делитесь доской по секретной ссылке — без регистрации и авторизации.

## Как это работает

```
Ввод текста (например: "подготовить релиз до пятницы")
        ↓
AI Parse → черновик с подзадачами, приоритетом, дедлайном
        ↓
Редактирование (human-in-the-loop review)
        ↓
Финализация → задача появляется на Kanban-доске
        ↓
Drag & Drop между колонками + SSE синхронизация в реальном времени
```

## Стек

| Часть       | Технологии                                           |
|-------------|------------------------------------------------------|
| Backend     | Fastify, TypeScript, Prisma, SQLite                  |
| Frontend    | React, Vite, TanStack Query, dnd-kit                 |
| AI          | NeuralDeep API (`NEURALDEEP_API_URL` из `.env`)      |
| Real-time   | Server-Sent Events (SSE)                             |

## Подготовка

На хосте нужны Git, Docker и Compose plugin. Для запуска тестов на хосте нужен Node 24 (см. «Проверки»). Создайте `.env` из примера и задайте реальные значения только локально:

```bash
cp .env.example .env
```

`.env.example` содержит только безопасные placeholder-значения. Секреты передаются серверу через переменные окружения и не копируются в образы. В клиент попадает только `VITE_API_URL`; для работы через Vite proxy или nginx он пустой.

## Разработка

```bash
# UI: http://localhost:5173, API: http://localhost:3001
docker compose -f compose.yaml -f compose.dev.yaml up --build

# Остановка без удаления данных
docker compose -f compose.yaml -f compose.dev.yaml down
```

Vite проксирует `/api` на `http://server:3001`. Исходники смонтированы в контейнеры, HMR и `tsx watch` включены. `node_modules` находятся в отдельных named volumes.

После изменения `server/prisma/schema.prisma` создайте новую миграцию:

```bash
docker compose -f compose.yaml -f compose.dev.yaml run --rm \
  -e RUN_MIGRATIONS=false server npx prisma migrate dev --name change_name
```

Не перезаписывайте уже применённые миграции. При старте сервер автоматически выполняет `prisma migrate deploy`.

## Проверки

Тесты запускаются на хосте (нужен Node 24), вне контейнеров:

```bash
cd server && npm ci && npm test
cd client && npm ci && npm test && npx playwright install && npm run test:e2e
```

В Docker выполняются только lint, format check, typecheck, production build и healthchecks:

```bash
sh scripts/check.sh
```

На хосте pre-commit запускает Husky и lint-staged: ESLint, Stylelint и Prettier исправляют только staged TS/TSX/CSS/SCSS и повторно добавляют изменения в index. Оставшиеся ошибки блокируют commit. Одноразовая установка tooling для хука: `npm ci`.

## Production-like и VPS

```bash
# Только http://127.0.0.1:8080 опубликован наружу
docker compose -f compose.yaml -f compose.prod.yaml up --build -d
```

Nginx раздаёт статический client build, проксирует API и SSE без buffering, запрещает `/admin/*`. Каталог `data/` в nginx не монтируется, поэтому SQLite-файл недоступен по HTTP.

Для VPS скопируйте Compose-файлы, `server/`, `client/`, `design/tokens.css` и `.env`, сохранив `data/` отдельно от release-артефактов. HTTPS должен обеспечивать внешний reverse proxy. В production публикуется только web-порт на loopback.

## SQLite и резервные копии

БД хранится на хосте в `data/doskito.db`, сохраняется при restart, rebuild и `down`. В контейнере процесс работает от `node` (non-root); entrypoint выдаёт ему права на `/app/data`. Если UID каталога на VPS отличается, настройте владельца host-каталога вручную.

Онлайн-backup выполняется SQLite Backup API в отдельный файл того же каталога:

```bash
docker compose -f compose.yaml -f compose.prod.yaml exec server \
  node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.\$queryRawUnsafe(\"VACUUM INTO '/app/data/backup.db'\").finally(() => p.\$disconnect())"
```

`VACUUM INTO` использует встроенный SQLite backup mechanism и создаёт консистентную копию. Перед повторным backup используйте новое имя файла. Простое копирование основной БД допускается только при остановленном server. Для restore остановите server, сохраните старую БД отдельно, замените `data/doskito.db` проверенной копией и снова запустите Compose. Не выполняйте restore на работающем сервере.
