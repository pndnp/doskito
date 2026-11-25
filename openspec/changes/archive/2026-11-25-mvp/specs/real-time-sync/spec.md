# Real-Time Sync

## Purpose

Распространение изменений активной доски подключённым клиентам через SSE. REST остаётся источником команд, повторный GET board state — способом восстановления после пропущенных событий.

## ADDED Requirements

### Requirement: REQ-RTS-1 — Подключение и heartbeat

Клиент SHALL подключаться через `GET /api/boards/:slug/sse`. Сервер MUST проверить, что доска активна, до открытия потока.

#### Scenario: Заголовки и первое событие

- **WHEN** соединение открыто
- **THEN** возвращаются `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- **AND** отправляется `retry: 3000` и `event: ready` с `{ "slug": "..." }`

#### Scenario: Heartbeat и очистка

- **WHEN** 15 секунд нет событий
- **THEN** отправляется `: heartbeat\n\n`
- **AND** при close/write error heartbeat останавливается, response удаляется из subscribers

#### Scenario: Доска недоступна

- **WHEN** доска не найдена или soft-deleted
- **THEN** до открытия SSE возвращается обычный 404

### Requirement: REQ-RTS-2 — Формат событий

Каждое событие SHALL иметь монотонно увеличивающийся в пределах процесса `id`, `event`, однострочный JSON `data`. Payload содержит актуальный объект, чтобы клиент мог обновить кэш без ожидания другого события.

#### Scenario: События задач

- **WHEN** создана, изменена или удалена задача
- **THEN** отправляются соответственно `task_created` / `task_updated` с `{ "task": { ...fullTask } }` либо `task_deleted` с `{ "taskId": "..." }`

#### Scenario: События черновиков

- **WHEN** черновик финализирован или отклонён
- **THEN** `draft_finalized` содержит `{ "draftId": "...", "taskIds": ["..."] }`
- **AND** `draft_discarded` содержит `{ "draftId": "...", "reason": "manual|expired" }`
- **AND** эти события отправляются только SSE-подключениям с тем же clientId, которому принадлежит черновик; `task_created` при финализации остаётся публичным для доски

#### Scenario: События доски и участников

- **WHEN** переименована доска или присоединился новый участник
- **THEN** `board_updated` содержит `{ "name": "...", "color": "..." }`, `user_joined` — `{ "name": "...", "color": "..." }`
- **AND** `board_deleted` содержит `{ "reason": "manual|inactivity" }`, после доставки соединения доски закрываются

### Requirement: REQ-RTS-3 — Порядок записи и доставки

Событие SHALL публиковаться только после успешного commit транзакции. Ошибка записи одному клиенту не отменяет REST-операцию или доставку остальным.

#### Scenario: Закрытый клиент

- **WHEN** запись клиенту завершилась ошибкой
- **THEN** subscriber удаляется, а операция доски остаётся committed

### Requirement: REQ-RTS-4 — Клиентский useSSE

Хук SHALL подписываться на все события, использовать `withCredentials: true` для передачи серверного clientId cookie, инвалидировать только соответствующую доску и закрывать EventSource при unmount.

#### Scenario: Reconnect

- **WHEN** соединение потеряно
- **THEN** EventSource переподключается автоматически, UI показывает reconnecting
- **AND** после `ready` выполняется полная инвалидация board state, включая PENDING-черновики владельца, восстанавливая пропущенные события

#### Scenario: Ошибки соединения

- **WHEN** поток временно недоступен
- **THEN** приложение продолжает работать с последними данными и показывает ненавязчивый offline/reconnecting статус
- **AND** после `board_deleted` reconnect не выполняется
