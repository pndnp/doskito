import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, boardUrl, copyText, type BoardState } from '../lib/api';
import { useToast } from './Toast';
import { Modal } from './BoardModals';

export function StatusBar({ board }: { board: BoardState }) {
  const done = board.tasks.filter((task) => task.status === 'done').length;
  const total = board.tasks.length;
  const percentage = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="status-bar">
      <span>{total === 0 ? 'Пока нет задач' : `Сделано ${done} из ${total}`}</span>
      <div
        className="status-bar-track"
        role="progressbar"
        aria-label="Выполнено задач"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="fill" style={{ width: `${percentage}%` }} />
      </div>
      {total > 0 && <strong>{percentage}%</strong>}
    </div>
  );
}

export function InviteModal({ board, close }: { board: BoardState; close: () => void }) {
  const [name, setName] = useState('');
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.post(`/api/boards/${board.slug}/join`, { name }),
    onSuccess: () => {
      showToast('Участник добавлен');
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['board', board.slug] });
    },
  });
  return (
    <Modal title="Пригласить по ссылке">
      <p className="invite-url">{boardUrl(board.slug)}</p>
      <button
        className="button button-secondary"
        onClick={() => {
          void copyText(boardUrl(board.slug)).then(
            () => showToast('Ссылка скопирована'),
            () => showToast('Не удалось скопировать ссылку', 'error'),
          );
        }}
      >
        Скопировать ссылку
      </button>
      <h3>Участники</h3>
      {board.users.length === 0 ? (
        <p>Пока никто не присоединился.</p>
      ) : (
        <ul className="users-list">
          {board.users.map((user) => (
            <li key={user.name}>
              <span className="user-dot" style={{ background: user.color }} />
              {user.name}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label htmlFor="participant-name">Ваше имя</label>
        <input
          id="participant-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={1}
          maxLength={40}
        />
        {mutation.isError && <p role="alert">Не удалось присоединиться. Повторите попытку.</p>}
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={close}>
            Закрыть
          </button>
          <button className="button button-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Добавляем…' : 'Присоединиться'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function LinkBanner({ slug, close }: { slug: string; close: () => void }) {
  const { showToast } = useToast();
  return (
    <aside className="link-banner">
      <div>
        <h2>Сохраните ссылку на доску</h2>
        <p>
          Это единственный способ вернуться к ней: если очистить данные браузера, список досок
          пропадёт.
        </p>
      </div>
      <span className="link-banner-url">{boardUrl(slug)}</span>
      <button
        className="button button-mint"
        onClick={() => {
          void copyText(boardUrl(slug)).then(
            () => showToast('Ссылка скопирована'),
            () => showToast('Не удалось скопировать ссылку', 'error'),
          );
        }}
      >
        Скопировать ссылку
      </button>
      <button className="icon-button" aria-label="Закрыть подсказку" onClick={close}>
        ×
      </button>
    </aside>
  );
}
