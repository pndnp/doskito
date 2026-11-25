import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { BOARDS_STORAGE_KEY, boardsStore } from '../store/boards';
import { metadata, mockApi, renderApp } from './utils';

beforeEach(() => {
  localStorage.clear();
  boardsStore.refresh();
  window.location.hash = '#/';
  vi.restoreAllMocks();
});

describe('Welcome и создание', () => {
  test('пустой каталог показывает Welcome с текстами макета', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Создайте доску' })).toBeInTheDocument();
    expect(screen.getByText('Без регистрации')).toBeInTheDocument();
    expect(screen.getByText('ИИ разбирает задачи')).toBeInTheDocument();
    expect(screen.getByText('Совместная работа по ссылке')).toBeInTheDocument();
  });

  test('создание сохраняет доску и открывает её, повторный submit заблокирован', async () => {
    const calls = mockApi();
    calls.get.mockResolvedValue({
      data: { ...metadata(), columns: [], tasks: [], users: [], drafts: [] },
    });
    let resolve:
      | ((value: { data: ReturnType<typeof metadata> & { url: string } }) => void)
      | undefined;
    calls.post.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    renderApp();
    const create = screen.getByRole('button', { name: 'Создать доску' });
    await user.click(create);
    expect(create).toBeDisabled();
    await user.click(create);
    expect(calls.post).toHaveBeenCalledTimes(1);
    resolve?.({ data: { ...metadata(), url: '/#/board001' } });
    expect(await screen.findByRole('button', { name: 'Переименовать доску' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/board001');
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });
});

describe('Открытие по ссылке', () => {
  test.each(['board001', '/#/board001', `${window.location.origin}/#/board001`])(
    'валидный ввод %s запрашивает board state и сохраняет доску',
    async (value) => {
      const calls = mockApi();
      calls.get.mockResolvedValue({
        data: {
          ...metadata(),
          slug: 'board001',
          columns: [],
          tasks: [],
          users: [],
          drafts: [],
        },
      });
      const user = userEvent.setup();
      renderApp();
      await user.type(screen.getByLabelText('Ссылка на доску'), value);
      await user.click(screen.getByRole('button', { name: 'Открыть' }));
      expect(calls.get).toHaveBeenCalledWith('/api/boards/board001');
      expect(
        await screen.findByRole('button', { name: 'Переименовать доску' }),
      ).toBeInTheDocument();
    },
  );

  test('произвольный текст и чужой path не вызывают API', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderApp();
    const input = screen.getByLabelText('Ссылка на доску');
    await user.type(input, 'https://doskito.app/#/board001');
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(calls.get).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Введите ссылку на доску');
    await user.clear(input);
    await user.type(input, 'произвольный текст');
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(calls.get).not.toHaveBeenCalled();
  });

  test('404 и network error различаются, введённая ссылка сохраняется', async () => {
    const calls = mockApi();
    calls.get.mockRejectedValueOnce(
      new AxiosError('not found', undefined, undefined, undefined, {
        status: 404,
        data: {},
        statusText: 'Not Found',
        headers: {},
        config: { headers: {} },
      } as never),
    );
    const user = userEvent.setup();
    renderApp();
    const input = screen.getByLabelText('Ссылка на доску');
    await user.type(input, 'board001');
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Доска не найдена');
    expect(input).toHaveValue('board001');
    calls.get.mockRejectedValueOnce(new AxiosError('network'));
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения');
  });
});

describe('Каталог и offline', () => {
  test('валидный каталог показывает список сразу и обновляет metadata', async () => {
    localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify([metadata()]));
    boardsStore.refresh();
    const calls = mockApi();
    calls.post.mockResolvedValue({
      data: {
        boards: [{ ...metadata(), name: 'Обновлённая доска', totalTasks: 3, doneTasks: 1 }],
        missingSlugs: [],
      },
    });
    renderApp();
    expect(screen.getByRole('heading', { name: 'Мои доски' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Моя доска' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Обновлённая доска' })).toBeInTheDocument();
    expect(calls.post).toHaveBeenCalledWith('/api/boards/summaries', { slugs: ['board001'] });
  });

  test('missing удаляется, network error сохраняет локальные данные', async () => {
    localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify([metadata(), metadata('board002')]));
    boardsStore.refresh();
    const calls = mockApi();
    calls.post.mockResolvedValueOnce({ data: { boards: [], missingSlugs: ['board002'] } });
    const { rerender } = renderApp();
    expect(screen.getAllByRole('heading', { name: 'Моя доска' })).toHaveLength(2);
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toHaveLength(1),
    );
    expect(screen.queryByRole('link', { name: 'Открыть доску Моя доска' })).toBeInTheDocument();
    rerender(<></>);
  });

  test('network error не стирает доску и показывает stale-data message', async () => {
    localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify([metadata()]));
    boardsStore.refresh();
    const calls = mockApi();
    calls.post.mockRejectedValue(new AxiosError('offline'));
    renderApp();
    expect(await screen.findByText(/могут быть устаревшими/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Моя доска' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  test('повреждённый JSON показывает безопасный Welcome без падения', () => {
    localStorage.setItem(BOARDS_STORAGE_KEY, '{broken');
    boardsStore.refresh();
    renderApp();
    expect(screen.getByRole('heading', { name: 'Создайте доску' })).toBeInTheDocument();
  });

  test('недоступный localStorage не роняет приложение и сообщает о локальном списке', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    boardsStore.add(metadata());
    const calls = mockApi();
    calls.post.mockRejectedValue(new AxiosError('offline'));
    renderApp();
    expect(screen.getByRole('heading', { name: 'Мои доски' })).toBeInTheDocument();
    expect(screen.getByText(/Изменения не удалось сохранить/)).toBeInTheDocument();
    setItem.mockRestore();
  });
});
