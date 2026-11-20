export type SseAudience = 'public' | { owner: string };

export interface BoardSseEvent {
  id: number;
  type: string;
  payload: unknown;
  audience: SseAudience;
}

export type BoardEventListener = (event: BoardSseEvent) => void | Promise<void>;

const listenersByBoard = new Map<string, Set<BoardEventListener>>();
let lastEventId = 0;

/**
 * Подписка на события доски. Используется SSE-эндпоинтом (задача 7)
 * и тестами для проверки публикуемых событий.
 */
export function subscribeBoardEvents(slug: string, listener: BoardEventListener): () => void {
  let listeners = listenersByBoard.get(slug);
  if (!listeners) {
    listeners = new Set();
    listenersByBoard.set(slug, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByBoard.delete(slug);
  };
}

export function publishPublicEvent(slug: string, type: string, payload: unknown): void {
  dispatch(slug, { type, payload, audience: 'public' });
}

export function publishOwnerEvent(
  slug: string,
  clientId: string,
  type: string,
  payload: unknown,
): void {
  dispatch(slug, { type, payload, audience: { owner: clientId } });
}

function dispatch(slug: string, event: Omit<BoardSseEvent, 'id'>): void {
  const listeners = listenersByBoard.get(slug);
  if (!listeners || listeners.size === 0) return;
  const sseEvent: BoardSseEvent = { ...event, id: (lastEventId += 1) };
  for (const listener of listeners) {
    try {
      const result = listener(sseEvent);
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // ошибка одного подписчика не должна ломать рассылку остальным
    }
  }
}

/** Сброс состояния шины между тестами. */
export function resetEventBus(): void {
  listenersByBoard.clear();
}
