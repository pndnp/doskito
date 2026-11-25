import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type BoardMetadata } from '../lib/api';
import { useBoardsStore } from '../store/boards';
import { BoardCard } from '../components/BoardCard';
import { Logo, OpenBoardForm, useCreateBoard } from '../components/Common';

interface SummariesResponse {
  boards: BoardMetadata[];
  missingSlugs: string[];
}

export function BoardsPage() {
  const { boards, storageError, updateMany } = useBoardsStore();
  const createBoard = useCreateBoard();
  const slugs = boards.map((board) => board.slug);
  const summaries = useQuery({
    queryKey: ['board-summaries', slugs],
    queryFn: async () =>
      (await api.post<SummariesResponse>('/api/boards/summaries', { slugs })).data,
    enabled: boards.length > 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (summaries.data) updateMany(summaries.data.boards, summaries.data.missingSlugs);
  }, [summaries.data, updateMany]);

  if (boards.length === 0) return null;
  return (
    <main className="page boards-page">
      <header className="boards-page-header">
        <Logo />
        <button
          className="button button-primary"
          disabled={createBoard.isPending}
          onClick={() => createBoard.mutate()}
        >
          {createBoard.isPending ? 'Создаём…' : 'Новая доска'}
        </button>
      </header>
      <div className="boards-page-intro">
        <div>
          <h1>Мои доски</h1>
          <p>Список хранится только в этом браузере: доступ к доске даёт ссылка.</p>
        </div>
        <OpenBoardForm />
      </div>
      {(storageError || summaries.isError) && (
        <p className="notice" role="status">
          {storageError
            ? 'Список доступен только в этом браузере. Изменения не удалось сохранить.'
            : 'Не удалось обновить данные. Показаны сохранённые сведения, они могут быть устаревшими.'}
        </p>
      )}
      <section className="boards-grid" aria-label="Список досок">
        {boards.map((board, index) => (
          <BoardCard key={board.slug} board={board} index={index} />
        ))}
        <button
          className="create-board-card card"
          disabled={createBoard.isPending}
          onClick={() => createBoard.mutate()}
        >
          <span className="create-board-card-plus" aria-hidden="true">
            +
          </span>
          <span>{createBoard.isPending ? 'Создаём…' : 'Создать доску'}</span>
        </button>
      </section>
      <p className="boards-page-disclaimer">
        Доски без активности 30 дней удаляются. Не делитесь ссылкой с теми, кому не доверяете: она
        даёт полный доступ.
      </p>
    </main>
  );
}
