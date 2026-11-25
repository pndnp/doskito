import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage, parseBoardLink, type BoardMetadata, type BoardState } from '../lib/api';
import { useBoardActions } from '../store/boards';
import { useToast } from './Toast';

export function Logo() {
  return (
    <div className="logo" aria-label="Доскито">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 28V14" stroke="var(--mint)" strokeWidth="3" strokeLinecap="round" />
        <path d="M16 15C16 9 11 6 5 7c0 6 4 9 11 8Z" fill="var(--mint)" />
        <path d="M16 12c0-5 4-8 11-7 0 6-4 9-11 7Z" fill="var(--yellow)" />
      </svg>
      <span>Доскито</span>
    </div>
  );
}

export function useCreateBoard() {
  const navigate = useNavigate();
  const { add } = useBoardActions();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<BoardMetadata & { url: string }>('/api/boards');
      return response.data;
    },
    onSuccess: (board) => {
      add({ ...board, updatedAt: new Date().toISOString(), totalTasks: 0, doneTasks: 0 });
      navigate(`/${board.slug}`);
    },
    onError: () => showToast('Не удалось создать доску. Повторите попытку.', 'error'),
  });
}

export function OpenBoardForm({ variant = 'list' }: { variant?: 'welcome' | 'list' }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { add } = useBoardActions();
  const mutation = useMutation({
    mutationFn: async (slug: string) => (await api.get<BoardState>(`/api/boards/${slug}`)).data,
    onSuccess: (board) => {
      add({
        slug: board.slug,
        name: board.name,
        color: board.color,
        updatedAt: board.updatedAt,
        totalTasks: board.tasks.length,
        doneTasks: board.tasks.filter((task) => (task as { status?: string }).status === 'done')
          .length,
      });
      navigate(`/${board.slug}`);
    },
    onError: (requestError) => {
      setError(errorMessage(requestError, 'Не удалось открыть доску. Повторите попытку.'));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const slug = parseBoardLink(value);
    if (!slug) {
      setError('Введите ссылку на доску или slug из 8 строчных букв и цифр.');
      return;
    }
    setError('');
    mutation.mutate(slug);
  }

  return (
    <div className={`open-board open-board--${variant}`}>
      <form onSubmit={submit}>
        {variant === 'welcome' && <span className="open-board-label">Уже есть ссылка?</span>}
        <label className="sr-only" htmlFor={`board-link-${variant}`}>
          Ссылка на доску
        </label>
        <input
          id={`board-link-${variant}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={variant === 'welcome' ? 'Вставьте ссылку' : 'Вставьте ссылку на доску'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `board-link-error-${variant}` : undefined}
          disabled={mutation.isPending}
        />
        <button className="button button-outline" disabled={mutation.isPending}>
          {mutation.isPending ? 'Открываем…' : 'Открыть'}
        </button>
      </form>
      {error && (
        <p className="form-error" id={`board-link-error-${variant}`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Loading({ children = 'Загрузка…' }: { children?: ReactNode }) {
  return (
    <p className="loading" role="status">
      {children}
    </p>
  );
}
