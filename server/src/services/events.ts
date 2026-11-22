import type { ServerResponse } from 'node:http';

export type SseAudience = 'public' | { owner: string };

export interface BoardSseEvent {
  id: number;
  type: string;
  payload: unknown;
  audience: SseAudience;
}

export interface SseSubscriber {
  clientId: string;
  response: ServerResponse;
}

export type BoardEventListener = (event: BoardSseEvent) => void | Promise<void>;

const subscribers = new Map<string, Set<SseSubscriber>>();
const listenersByBoard = new Map<string, Set<BoardEventListener>>();
let lastEventId = 0;

export function addBoardSubscriber(slug: string, subscriber: SseSubscriber): () => void {
  let boardSubscribers = subscribers.get(slug);
  if (!boardSubscribers) {
    boardSubscribers = new Set();
    subscribers.set(slug, boardSubscribers);
  }
  boardSubscribers.add(subscriber);

  return () => {
    boardSubscribers.delete(subscriber);
    if (boardSubscribers.size === 0) subscribers.delete(slug);
  };
}

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
  const boardSubscribers = subscribers.get(slug);
  const boardListeners = listenersByBoard.get(slug);
  if (!boardSubscribers?.size && !boardListeners?.size) return;
  const sseEvent: BoardSseEvent = { ...event, id: (lastEventId += 1) };
  for (const subscriber of [...(subscribers.get(slug) ?? [])]) {
    if (event.audience !== 'public' && subscriber.clientId !== event.audience.owner) continue;
    writeEvent(subscriber.response, sseEvent);
    if (event.type === 'board_deleted') subscriber.response.end();
  }
  for (const listener of listenersByBoard.get(slug) ?? []) {
    try {
      const result = listener(sseEvent);
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // ошибка одного подписчика не должна ломать рассылку остальным
    }
  }
}

export function createSseEvent(type: string, payload: unknown): BoardSseEvent {
  return { id: (lastEventId += 1), type, payload, audience: 'public' };
}

export function writeEvent(response: ServerResponse, event: BoardSseEvent): void {
  if (response.destroyed || response.writableEnded) return;
  try {
    response.write(formatSseEvent(event));
  } catch {
    response.destroy();
  }
}

export function formatSseEvent(event: BoardSseEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

export function closeBoardSubscribers(): void {
  for (const boardSubscribers of subscribers.values()) {
    for (const subscriber of boardSubscribers) subscriber.response.end();
  }
  subscribers.clear();
}

/** Очистка состояния только между изолированными тестами. */
export function resetEventBus(): void {
  subscribers.clear();
  listenersByBoard.clear();
}
