import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { ru } from 'date-fns/locale';
import { boardUrl, copyText, type BoardMetadata } from '../lib/api';
import { useBoardActions } from '../store/boards';
import { DeleteBoardModal, RenameBoardModal } from './BoardModals';
import { useToast } from './Toast';

export function BoardCard({ board, index }: { board: BoardMetadata; index: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { remove } = useBoardActions();
  const { showToast } = useToast();
  const progress = board.totalTasks === 0 ? 0 : (board.doneTasks / board.totalTasks) * 100;
  const style = {
    '--board-color': board.color,
    '--r': `${index % 2 === 0 ? -0.6 : 0.6}deg`,
  } as CSSProperties;

  function open() {
    navigate(`/${board.slug}`);
  }
  function keyboardOpen(event: KeyboardEvent<HTMLElement>) {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      open();
    }
  }
  async function copy() {
    try {
      await copyText(boardUrl(board.slug));
      showToast('Ссылка скопирована');
    } catch {
      showToast('Не удалось скопировать ссылку. Скопируйте её из адресной строки.', 'error');
    }
  }

  return (
    <>
      <article
        className="board-card card"
        style={style}
        role="link"
        tabIndex={0}
        aria-label={`Открыть доску ${board.name}`}
        onClick={open}
        onKeyDown={keyboardOpen}
      >
        <div className="board-card-top">
          <span className="board-card-tile" aria-hidden="true">
            {board.name.trim().charAt(0).toLocaleUpperCase('ru-RU')}
          </span>
          <div className="board-card-menu">
            <button
              className="icon-button"
              aria-label={`Меню доски ${board.name}`}
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((value) => !value);
              }}
            >
              ···
            </button>
            {menuOpen && (
              <div className="dropdown" onClick={(event) => event.stopPropagation()}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setRenaming(true);
                  }}
                >
                  Переименовать
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleting(true);
                  }}
                >
                  Удалить доску
                </button>
                <button
                  onClick={() => {
                    remove(board.slug);
                    setMenuOpen(false);
                    showToast('Доска убрана из списка. На сервере она сохранилась.');
                  }}
                >
                  Убрать из списка
                </button>
              </div>
            )}
          </div>
        </div>
        <h2>{board.name}</h2>
        <div className="board-card-progress">
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`Прогресс доски ${board.name}`}
            aria-valuemin={0}
            aria-valuemax={board.totalTasks}
            aria-valuenow={board.doneTasks}
          >
            <div className="fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="board-card-meta">
            <span>
              {board.doneTasks} из {board.totalTasks} задач готово
            </span>
            <time dateTime={board.updatedAt}>
              {formatDistanceToNowStrict(new Date(board.updatedAt), {
                locale: ru,
                addSuffix: true,
              })}
            </time>
          </div>
        </div>
        <button
          className="button button-secondary board-card-copy"
          onClick={(event) => {
            event.stopPropagation();
            void copy();
          }}
        >
          Скопировать ссылку
        </button>
      </article>
      {renaming && <RenameBoardModal board={board} close={() => setRenaming(false)} />}
      {deleting && <DeleteBoardModal board={board} close={() => setDeleting(false)} />}
    </>
  );
}
