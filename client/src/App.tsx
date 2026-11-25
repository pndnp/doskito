import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BoardsPage } from './pages/BoardsPage';
import { BoardView } from './pages/BoardView';
import { Welcome } from './pages/Welcome';
import { useBoardsStore } from './store/boards';
import { api, errorMessage, type BoardState } from './lib/api';
import axios from 'axios';
import { Loading, Logo } from './components/Common';
import { useBoardActions } from './store/boards';

function Home() {
  const { boards } = useBoardsStore();
  return boards.length === 0 ? <Welcome /> : <BoardsPage />;
}

function BoardRoute() {
  const { slug = '' } = useParams();
  const { add, remove } = useBoardActions();
  const board = useQuery({
    queryKey: ['board', slug],
    queryFn: async () => (await api.get<BoardState>(`/api/boards/${slug}`)).data,
    enabled: /^[a-z0-9]{8}$/.test(slug),
    retry: false,
  });
  useEffect(() => {
    if (!board.data) return;
    add({
      slug: board.data.slug,
      name: board.data.name,
      color: board.data.color,
      updatedAt: board.data.updatedAt,
      totalTasks: board.data.tasks.length,
      doneTasks: board.data.tasks.filter((task) => (task as { status?: string }).status === 'done')
        .length,
    });
  }, [board.data, add]);

  useEffect(() => {
    if (board.isError && axios.isAxiosError(board.error) && board.error.response?.status === 404) {
      remove(slug);
    }
  }, [board.isError, board.error, remove, slug]);

  if (!/^[a-z0-9]{8}$/.test(slug)) return <Navigate to="/" replace />;
  if (board.isPending) return <Loading>Загружаем доску…</Loading>;
  if (board.isError) {
    return (
      <main className="page board-placeholder">
        <Logo />
        <h1>Доска удалена или недоступна</h1>
        <p role="alert">
          Владелец ссылки удалил доску для всех участников либо она была удалена после 30 дней без
          активности. Сохранённая ссылка больше не работает.
        </p>
        <p>{errorMessage(board.error, 'Не удалось загрузить доску.')}</p>
        <a className="button button-outline" href="#/">
          Вернуться к моим доскам
        </a>
      </main>
    );
  }
  return <BoardView board={board.data} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:slug" element={<BoardRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
