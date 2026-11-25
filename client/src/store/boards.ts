import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { BoardMetadata } from '../lib/api';

export const BOARDS_STORAGE_KEY = 'doskito_boards';
export const STORAGE_NOTICE = 'Список доступен только в этом браузере и не был сохранён.';

let boards: BoardMetadata[] = [];
let storageError = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function isMetadata(value: unknown): value is BoardMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const board = value as Record<string, unknown>;
  return (
    typeof board.slug === 'string' &&
    /^[a-z0-9]{8}$/.test(board.slug) &&
    typeof board.name === 'string' &&
    board.name.length > 0 &&
    typeof board.color === 'string' &&
    typeof board.updatedAt === 'string' &&
    Number.isFinite(Date.parse(board.updatedAt)) &&
    typeof board.totalTasks === 'number' &&
    Number.isInteger(board.totalTasks) &&
    board.totalTasks >= 0 &&
    typeof board.doneTasks === 'number' &&
    Number.isInteger(board.doneTasks) &&
    board.doneTasks >= 0 &&
    board.doneTasks <= board.totalTasks
  );
}

function load(): BoardMetadata[] {
  try {
    const stored = window.localStorage.getItem(BOARDS_STORAGE_KEY);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error('invalid storage');
    return parsed.filter(isMetadata);
  } catch {
    storageError = true;
    return [];
  }
}

function write(next: BoardMetadata[]): boolean {
  try {
    window.localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    storageError = true;
    return false;
  }
}

function commit(next: BoardMetadata[]): void {
  boards = next;
  write(next);
  notify();
}

export const boardsStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): BoardMetadata[] {
    return boards;
  },
  getStorageError(): boolean {
    return storageError;
  },
  refresh(): void {
    boards = load();
    notify();
  },
  add(board: BoardMetadata): void {
    const next = boards.filter((item) => item.slug !== board.slug);
    commit([board, ...next]);
  },
  updateMany(updated: BoardMetadata[], missingSlugs: string[]): void {
    const missing = new Set(missingSlugs);
    const bySlug = new Map(updated.map((board) => [board.slug, board]));
    commit(
      boards.flatMap((board) => {
        if (missing.has(board.slug)) return [];
        return [bySlug.get(board.slug) ?? board];
      }),
    );
  },
  remove(slug: string): void {
    commit(boards.filter((board) => board.slug !== slug));
  },
};

if (typeof window !== 'undefined') {
  boards = load();
  window.addEventListener('storage', (event) => {
    if (event.key === BOARDS_STORAGE_KEY) boardsStore.refresh();
  });
}

export function useBoardsStore() {
  const items = useSyncExternalStore(boardsStore.subscribe, boardsStore.getSnapshot, () => boards);
  const unavailable = useSyncExternalStore(
    boardsStore.subscribe,
    boardsStore.getStorageError,
    () => storageError,
  );
  return useMemo(
    () => ({
      boards: items,
      storageError: unavailable,
      add: boardsStore.add,
      updateMany: boardsStore.updateMany,
      remove: boardsStore.remove,
    }),
    [items, unavailable],
  );
}

export function useBoardActions() {
  return {
    add: useCallback(boardsStore.add, []),
    updateMany: useCallback(boardsStore.updateMany, []),
    remove: useCallback(boardsStore.remove, []),
  };
}
