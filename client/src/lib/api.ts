import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
});

export interface BoardMetadata {
  slug: string;
  name: string;
  color: string;
  updatedAt: string;
  totalTasks: number;
  doneTasks: number;
}

export type TaskStatus = 'todo' | 'progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedFields {
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
  subTasks: Array<{ title: string }>;
}

export interface ParsedDraft {
  draftId: string;
  rawText: string;
  parsedFields: ParsedFields;
  status: 'PENDING' | 'FINALIZED' | 'DISCARDED';
  expiresAt: string;
}

export interface BoardState extends BoardMetadata {
  columns: Array<{ id: TaskStatus; title: string; order: number }>;
  tasks: Task[];
  users: Array<{ name: string; color: string }>;
  drafts: ParsedDraft[];
}

export function boardUrl(slug: string): string {
  return `${window.location.origin}/#/${slug}`;
}

export function parseBoardLink(value: string): string | null {
  const input = value.trim();
  if (/^[a-z0-9]{8}$/.test(input)) return input;
  try {
    const url = new URL(input, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== '/') return null;
    const match = /^#\/([a-z0-9]{8})\/?$/.exec(url.hash);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) return 'Доска не найдена';
    if (!error.response) return 'Нет соединения с сервером. Проверьте сеть и повторите попытку.';
  }
  return fallback;
}

export async function copyText(text: string): Promise<void> {
  try {
    const clipboardWrite = navigator.clipboard?.writeText;
    if (clipboardWrite) {
      await clipboardWrite.call(navigator.clipboard, text);
      return;
    }
  } catch {
    // Ниже — fallback для браузеров без разрешения Clipboard API.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.setAttribute('readonly', '');
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Копирование не поддерживается');
}
