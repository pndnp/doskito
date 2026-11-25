import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { BOARDS_STORAGE_KEY, boardsStore } from '../store/boards';
import type { BoardState, Task } from '../lib/api';
import { metadata, mockApi, renderApp } from './utils';
import { MockEventSource } from './event-source';

const TASK: Task = {
  id: 'task1',
  title: 'Подготовить релиз',
  status: 'todo',
  priority: 'high',
  dueDate: '2026-11-20',
  tags: ['релиз'],
  order: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function board(tasks: Task[] = []): BoardState {
  return {
    ...metadata(),
    columns: [
      { id: 'todo', title: 'Сделать', order: 0 },
      { id: 'progress', title: 'Делаю', order: 1 },
      { id: 'done', title: 'Готово', order: 2 },
    ],
    tasks,
    users: [],
    drafts: [],
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify([metadata()]));
  boardsStore.refresh();
  vi.restoreAllMocks();
});

async function openBoard(tasks: Task[] = []) {
  const calls = mockApi();
  const state = board(tasks);
  calls.get.mockResolvedValue({ data: state });
  renderApp('/board001');
  expect(await screen.findByRole('button', { name: 'Переименовать доску' })).toBeInTheDocument();
  return { calls, user: userEvent.setup(), state };
}

describe('Empty Board', () => {
  test('показывает баннер, пустой прогресс и три drop zones', async () => {
    await openBoard();
    expect(screen.getByText('Пока нет задач')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Выполнено задач' })).toHaveAttribute(
      'aria-valuemax',
      '0',
    );
    expect(screen.getAllByText('Сюда попадут задачи')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Сохраните ссылку на доску' })).toBeInTheDocument();
  });

  test('пример заполняет input без отправки, баннер остаётся закрытым', async () => {
    const { calls, user } = await openBoard();
    await user.click(screen.getByRole('button', { name: 'Подготовить релиз до пятницы' }));
    expect(screen.getByLabelText('Новая задача')).toHaveValue('Подготовить релиз до пятницы');
    expect(calls.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Закрыть подсказку' }));
    expect(localStorage.getItem('doskito_link_dismissed_board001')).toBe('true');
    expect(
      screen.queryByRole('heading', { name: 'Сохраните ссылку на доску' }),
    ).not.toBeInTheDocument();
  });
});

describe('QuickAdd', () => {
  test('отправляет текст, блокирует повтор и очищает поле', async () => {
    const { calls, user } = await openBoard();
    let resolve: ((value: unknown) => void) | undefined;
    calls.post.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const input = screen.getByLabelText('Новая задача');
    await user.type(input, 'Новая задача{Enter}');
    expect(screen.getByRole('button', { name: /Разбираем/ })).toBeDisabled();
    expect(calls.post).toHaveBeenCalledTimes(1);
    resolve?.({
      data: {
        draftId: 'draft1',
        rawText: 'Новая задача',
        status: 'PENDING',
        expiresAt: new Date().toISOString(),
        parsedFields: {
          title: 'Новая задача',
          priority: 'medium',
          dueDate: null,
          tags: [],
          subTasks: [],
        },
      },
    });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  test('ответ AI сразу открывает модальное окно черновика с подзадачами', async () => {
    const { calls, user } = await openBoard();
    calls.post.mockResolvedValue({
      data: {
        draftId: 'draft1',
        rawText: 'Подготовить релиз',
        status: 'PENDING',
        expiresAt: new Date().toISOString(),
        parsedFields: {
          title: 'Подготовить релиз',
          priority: 'high',
          dueDate: null,
          tags: [],
          subTasks: [{ title: 'Написать ченджлог' }, { title: 'Согласовать релиз' }],
        },
      },
    });
    await user.type(screen.getByLabelText('Новая задача'), 'Подготовить релиз{Enter}');
    expect(await screen.findByRole('region', { name: 'Черновик задачи' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Написать ченджлог')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Согласовать релиз')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить на доску' })).toBeInTheDocument();
  });

  test('503 показывает toast и ручной fallback', async () => {
    const { calls, user } = await openBoard();
    calls.post.mockRejectedValue(new AxiosError('offline'));
    await user.type(screen.getByLabelText('Новая задача'), 'Задача{Enter}');
    expect(
      await screen.findByText('Не удалось разобрать задачу. Создайте вручную.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Создать вручную' }));
    expect(screen.getByRole('heading', { name: 'Новая задача' })).toBeInTheDocument();
  });
});

describe('BoardView и участники', () => {
  test('invite копирует ссылку и join добавляет участника', async () => {
    const { calls, user } = await openBoard();
    await user.click(screen.getByRole('button', { name: 'Пригласить по ссылке' }));
    calls.post.mockResolvedValue({ data: { name: 'Аня', color: 'hsl(1, 65%, 60%)' } });
    await user.type(screen.getByLabelText('Ваше имя'), 'Аня');
    await user.click(screen.getByRole('button', { name: 'Присоединиться' }));
    expect(calls.post).toHaveBeenCalledWith('/api/boards/board001/join', { name: 'Аня' });
    await waitFor(() => expect(calls.get).toHaveBeenCalledTimes(2));
  });

  test('rename вызывает PATCH и обновляет board state', async () => {
    const { calls, user } = await openBoard();
    calls.patch.mockResolvedValue({ data: { name: 'Новая доска' } });
    await user.click(screen.getByRole('button', { name: 'Переименовать доску' }));
    await user.clear(screen.getByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Новая доска');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(calls.patch).toHaveBeenCalledWith('/api/boards/board001', { name: 'Новая доска' });
  });
});

describe('AI Preview и SSE', () => {
  test('PENDING черновик восстанавливается, правки PATCH → finalize', async () => {
    const state = board();
    state.drafts = [
      {
        draftId: 'draft1',
        rawText: 'Релиз',
        status: 'PENDING',
        expiresAt: new Date().toISOString(),
        parsedFields: {
          title: 'Релиз',
          priority: 'high',
          dueDate: null,
          tags: [],
          subTasks: [{ title: 'Ченджлог' }],
        },
      },
    ];
    const calls = mockApi();
    calls.get.mockResolvedValue({ data: state });
    calls.patch.mockResolvedValue({ data: {} });
    calls.post.mockResolvedValue({ data: { tasks: [] } });
    const user = userEvent.setup();
    renderApp('/board001');
    expect(
      await screen.findByText('ИИ нарисовал черновик. Поправьте, что нужно'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сохранить на доску' }));
    await waitFor(() =>
      expect(calls.patch).toHaveBeenCalledWith(
        '/api/boards/board001/drafts/draft1',
        expect.objectContaining({ title: 'Релиз' }),
      ),
    );
    expect(calls.post).toHaveBeenCalledWith('/api/boards/board001/drafts/draft1/finalize');
  });

  test('отмена вызывает discard, сохранение ошибки оставляет ввод', async () => {
    const state = board();
    state.drafts = [
      {
        draftId: 'draft1',
        rawText: 'Релиз',
        status: 'PENDING',
        expiresAt: new Date().toISOString(),
        parsedFields: { title: 'Релиз', priority: 'high', dueDate: null, tags: [], subTasks: [] },
      },
    ];
    const calls = mockApi();
    calls.get.mockResolvedValue({ data: state });
    calls.patch.mockRejectedValue(new AxiosError('offline'));
    const user = userEvent.setup();
    renderApp('/board001');
    await user.click(await screen.findByRole('button', { name: 'Сохранить на доску' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Данные формы сохранены');
    expect(screen.getByLabelText('Название')).toHaveValue('Релиз');
  });

  test('SSE подключается с credentials, обновляет доску и закрывается после board_deleted', async () => {
    await openBoard();
    const source = MockEventSource.instances[0];
    expect(source?.withCredentials).toBe(true);
    source?.emit('ready', { slug: 'board001' });
    expect(await screen.findByText('Синхронизация')).toBeInTheDocument();
    source?.emit('task_updated', { task: TASK });
    source?.emit('board_deleted', { reason: 'manual' });
    expect(
      await screen.findByRole('heading', { name: 'Доска удалена или недоступна' }),
    ).toBeInTheDocument();
    expect(source?.closed).toBe(true);
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toEqual([]);
  });
});

describe('Задачи', () => {
  test('карточка показывает локализованный приоритет, тег и дату без вложенного прогресса', async () => {
    await openBoard([TASK]);
    expect(screen.getByText('Высокий')).toBeInTheDocument();
    expect(screen.getByText('релиз')).toBeInTheDocument();
    expect(screen.getByText(/до .*20/)).toBeInTheDocument();
    expect(screen.queryByText('0 из 0')).not.toBeInTheDocument();
  });

  test('ручное создание из колонки отправляет все поля и refetch', async () => {
    const { calls, user } = await openBoard();
    calls.post.mockResolvedValue({ data: TASK });
    await user.click(screen.getByRole('button', { name: 'Добавить в колонку Сделать' }));
    await user.type(screen.getByLabelText('Название'), 'Подготовить релиз');
    await user.type(screen.getByLabelText('Теги через запятую (до 10)'), 'релиз, срочно');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(calls.post).toHaveBeenCalledWith('/api/boards/board001/tasks', {
      title: 'Подготовить релиз',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      tags: ['релиз', 'срочно'],
    });
    await waitFor(() => expect(calls.get).toHaveBeenCalledTimes(2));
  });

  test('редактирование и перемещение используют PATCH', async () => {
    const { calls, user } = await openBoard([TASK]);
    calls.patch.mockResolvedValue({ data: TASK });
    await user.click(screen.getByRole('button', { name: 'Меню задачи Подготовить релиз' }));
    await user.click(screen.getByRole('button', { name: 'Переместить в «Готово»' }));
    expect(calls.patch).toHaveBeenCalledWith('/api/boards/board001/tasks/task1', {
      status: 'done',
    });
    await user.click(screen.getByRole('button', { name: 'Меню задачи Подготовить релиз' }));
    await user.click(screen.getByRole('button', { name: 'Редактировать' }));
    expect(screen.getByLabelText('Название')).toHaveValue('Подготовить релиз');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(calls.patch).toHaveBeenCalledWith(
      '/api/boards/board001/tasks/task1',
      expect.objectContaining({ title: 'Подготовить релиз' }),
    );
  });

  test('удаление требует подтверждения', async () => {
    const { calls, user } = await openBoard([TASK]);
    calls.remove.mockResolvedValue({ data: undefined });
    await user.click(screen.getByRole('button', { name: 'Меню задачи Подготовить релиз' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить задачу?' });
    expect(calls.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    expect(calls.remove).toHaveBeenCalledWith('/api/boards/board001/tasks/task1');
  });
});
