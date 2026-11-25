import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { BOARDS_STORAGE_KEY, boardsStore } from '../store/boards';
import * as apiLib from '../lib/api';
import { metadata, mockApi, renderApp } from './utils';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify([metadata()]));
  boardsStore.refresh();
  window.location.hash = '#/';
  vi.restoreAllMocks();
});

async function renderList(clipboard?: Clipboard) {
  if (clipboard) {
    Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
  }
  const user = userEvent.setup();
  if (clipboard) {
    Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
  }
  const calls = mockApi();
  calls.post.mockResolvedValue({ data: { boards: [metadata()], missingSlugs: [] } });
  renderApp();
  return { user, calls };
}

async function openMenu() {
  const context = await renderList();
  await context.user.click(screen.getByRole('button', { name: 'Меню доски Моя доска' }));
  return context;
}

describe('Копирование', () => {
  test('Clipboard API копирует текущий origin без открытия доски', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { user } = await renderList({ writeText } as unknown as Clipboard);
    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/#/board001`),
    );
    expect(window.location.hash).toBe('#/');
    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();
  });

  test('при отказе Clipboard API используется fallback', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    const { user } = await renderList({ writeText } as unknown as Clipboard);
    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();
  });

  test('при ошибке обоих способов показывается feedback', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    document.execCommand = vi.fn().mockReturnValue(false);
    const { user } = await renderList({ writeText } as unknown as Clipboard);
    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    expect(await screen.findByText(/Не удалось скопировать/)).toBeInTheDocument();
  });
});

describe('Удаление и меню', () => {
  test('rename вызывает PATCH и обновляет локальную карточку', async () => {
    const { user, calls } = await openMenu();
    calls.patch.mockResolvedValue({ data: { slug: 'board001', name: 'Новое имя' } });
    await user.click(screen.getByRole('button', { name: 'Переименовать' }));
    const input = screen.getByLabelText('Название');
    await user.clear(input);
    await user.type(input, 'Новое имя');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(calls.patch).toHaveBeenCalledWith('/api/boards/board001', { name: 'Новое имя' });
    expect(await screen.findByRole('heading', { name: 'Новое имя' })).toBeInTheDocument();
  });

  test('убрать из списка меняет только localStorage и не вызывает DELETE', async () => {
    const { user, calls } = await openMenu();
    await user.click(screen.getByRole('button', { name: 'Убрать из списка' }));
    expect(calls.remove).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toEqual([]);
    expect(await screen.findByRole('heading', { name: 'Создайте доску' })).toBeInTheDocument();
  });

  test('отмена и Escape не вызывают DELETE, safe focus на отмене', async () => {
    const { user, calls } = await openMenu();
    await user.click(screen.getByRole('button', { name: 'Удалить доску' }));
    expect(screen.getByRole('heading', { name: 'Удалить доску для всех?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Меню доски Моя доска' }));
    await user.click(screen.getByRole('button', { name: 'Удалить доску' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(calls.remove).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  test('DELETE успешен только после подтверждения', async () => {
    const { user, calls } = await openMenu();
    await user.click(screen.getByRole('button', { name: 'Удалить доску' }));
    expect(calls.remove).not.toHaveBeenCalled();
    calls.remove.mockResolvedValue({ data: undefined });
    await user.click(screen.getByRole('button', { name: 'Удалить для всех' }));
    await waitFor(() => expect(calls.remove).toHaveBeenCalledWith('/api/boards/board001'));
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toEqual([]);
    expect(await screen.findByText('Доска удалена для всех участников')).toBeInTheDocument();
  });

  test('ошибка DELETE оставляет доску и позволяет повторить', async () => {
    const { user, calls } = await openMenu();
    await user.click(screen.getByRole('button', { name: 'Удалить доску' }));
    calls.remove.mockRejectedValueOnce(new AxiosError('network'));
    await user.click(screen.getByRole('button', { name: 'Удалить для всех' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения');
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
    calls.remove.mockResolvedValue({ data: undefined });
    await user.click(screen.getByRole('button', { name: 'Удалить для всех' }));
    await waitFor(() => expect(calls.remove).toHaveBeenCalledTimes(2));
  });

  test('повторный DELETE заблокирован на время запроса', async () => {
    const { user, calls } = await openMenu();
    await user.click(screen.getByRole('button', { name: 'Удалить доску' }));
    calls.remove.mockImplementation(() => new Promise(() => undefined));
    await user.click(screen.getByRole('button', { name: 'Удалить для всех' }));
    expect(screen.getByRole('button', { name: 'Удаляем…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Удаляем…' }));
    expect(calls.remove).toHaveBeenCalledTimes(1);
  });
});

test('copyText использует textarea при отсутствии Clipboard API', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  document.execCommand = vi.fn().mockReturnValue(true);
  await apiLib.copyText('текст');
  expect(document.execCommand).toHaveBeenCalledWith('copy');
});
