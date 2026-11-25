import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, errorMessage, type BoardMetadata } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useBoardActions } from '../store/boards';
import { useToast } from './Toast';

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2 id="modal-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

export function RenameBoardModal({ board, close }: { board: BoardMetadata; close: () => void }) {
  const [name, setName] = useState(board.name);
  const { updateMany } = useBoardActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => (await api.patch(`/api/boards/${board.slug}`, { name })).data,
    onSuccess: () => {
      updateMany([{ ...board, name: name.trim(), updatedAt: new Date().toISOString() }], []);
      void queryClient.invalidateQueries({ queryKey: ['board', board.slug] });
      showToast('Доска переименована');
      close();
    },
  });
  return (
    <Modal title="Переименовать доску">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label htmlFor="board-name">Название</label>
        <input
          id="board-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={1}
          maxLength={80}
          required
          autoFocus
        />
        {mutation.isError && <p role="alert">Не удалось переименовать доску. Повторите попытку.</p>}
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={close}>
            Отмена
          </button>
          <button className="button button-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteBoardModal({ board, close }: { board: BoardMetadata; close: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { remove } = useBoardActions();
  const { showToast } = useToast();
  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/boards/${board.slug}`),
    onSuccess: () => {
      remove(board.slug);
      showToast('Доска удалена для всех участников');
      close();
      window.location.hash = '#/';
    },
  });
  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !mutation.isPending) close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, mutation.isPending]);
  return (
    <Modal title="Удалить доску для всех?">
      <p>
        Доска «{board.name}» станет недоступна для всех участников. Все задачи и черновики будут
        удалены. Ссылка перестанет работать. Это действие нельзя отменить.
      </p>
      {mutation.isError && (
        <p className="form-error" role="alert">
          {errorMessage(mutation.error, 'Не удалось удалить доску. Повторите попытку.')}
        </p>
      )}
      <div className="modal-actions">
        <button
          ref={cancelRef}
          className="button button-outline"
          disabled={mutation.isPending}
          onClick={close}
        >
          Отмена
        </button>
        <button
          className="button button-danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Удаляем…' : 'Удалить для всех'}
        </button>
      </div>
    </Modal>
  );
}
