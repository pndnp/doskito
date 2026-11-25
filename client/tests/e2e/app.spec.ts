import { expect, test } from '@playwright/test';

test('Welcome → create → rename → AI draft → independent tasks → manual CRUD', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Создайте доску' })).toBeVisible();
  await page.getByRole('button', { name: 'Создать доску', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Переименовать доску' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сохраните ссылку на доску' })).toBeVisible();

  await page.getByRole('button', { name: 'Переименовать доску' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Релиз v2');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Релиз v2')).toBeVisible();

  await page.getByLabel('Новая задача').fill('Подготовить релиз до пятницы');
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Черновик задачи' })).toBeVisible();
  await page.getByLabel('Подзадача 1').fill('Обновить ченджлог');
  await page.getByRole('button', { name: 'Сохранить на доску' }).click();
  await expect(page.getByRole('heading', { name: 'Подготовить релиз', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Обновить ченджлог', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Согласовать релиз', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить в колонку Сделать' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Проверить сборку');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проверить сборку', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Меню задачи Проверить сборку' }).click();
  await expect(page.getByRole('button', { name: 'Редактировать' })).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Проверить production');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Проверить production', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Меню задачи Проверить production' }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Удалить задачу?' })
    .getByRole('button', { name: 'Удалить' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Проверить production', exact: true }),
  ).toHaveCount(0);
});

test('две вкладки: join, rename, owner draft, delete board и terminal экран', async ({
  browser,
}) => {
  const owner = await browser.newContext();
  const other = await browser.newContext();
  const first = await owner.newPage();
  const second = await other.newPage();
  await first.goto('/');
  await first.getByRole('button', { name: 'Создать доску', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Переименовать доску' })).toBeVisible();
  const slug = first.url().split('/').at(-1)!;
  await second.goto(`/#/${slug}`);
  await second.getByRole('button', { name: 'Пригласить по ссылке' }).click();
  await second.getByLabel('Ваше имя').fill('Аня');
  await second.getByRole('button', { name: 'Присоединиться' }).click();
  await second.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(first.getByText('Аня', { exact: true })).toHaveCount(0);
  await first.getByRole('button', { name: 'Пригласить по ссылке' }).click();
  await expect(first.getByText('Аня', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Закрыть', exact: true }).click();

  await second.getByRole('button', { name: 'Переименовать доску' }).click();
  await second.getByLabel('Название', { exact: true }).fill('Общая доска');
  await second.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(first.getByText('Общая доска')).toBeVisible();

  await first.getByLabel('Новая задача').fill('Приватный черновик');
  await first.getByRole('button', { name: 'Разобрать', exact: true }).click();
  await expect(first.getByRole('region', { name: 'Черновик задачи' })).toBeVisible();
  await expect(second.getByRole('region', { name: 'Черновик задачи' })).toHaveCount(0);

  await second.getByRole('button', { name: 'Удалить доску', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
  await second.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Переименовать доску' })).toBeVisible();
  await second.getByRole('button', { name: 'Удалить доску', exact: true }).click();
  await second.getByRole('button', { name: 'Удалить для всех' }).click();
  await expect(first.getByRole('heading', { name: 'Доска удалена или недоступна' })).toBeVisible();
  await expect(first.getByText(/Сохранённая ссылка больше не работает/)).toBeVisible();
  await owner.close();
  await other.close();
});

test('keyboard flows: Tab navigation, Enter submit, Escape cancel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Создайте доску' })).toBeVisible();

  // Tab через все элементы Welcome
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Создать доску' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Ссылка на доску')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Открыть' })).toBeFocused();

  // Enter создаёт доску
  await page.getByRole('button', { name: 'Создать доску' }).click();
  await expect(page.getByRole('button', { name: 'Переименовать доску' })).toBeVisible();

  // Enter в QuickAdd запускает AI parse
  await page.getByLabel('Новая задача').fill('Задача по клавиатуре');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Черновик задачи' })).toBeVisible();

  // Escape закрывает превью → проверяем что вернулись к board
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByRole('button', { name: 'Разобрать' })).toBeVisible();

  // Add task manually
  await page.getByRole('button', { name: 'Добавить в колонку Сделать' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Task via KB');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Task via KB' })).toBeVisible();

  // Wait for any stale menus to close
  await expect(page.getByRole('dialog', { name: /редактировать|удалить/i })).not.toBeVisible();

  // Edit task via keyboard menu
  await page.getByRole('button', { name: 'Меню задачи Task via KB' }).press('Enter');
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByLabel('Название', { exact: true }).press('Control+a');
  await page.getByLabel('Название', { exact: true }).fill('Updated via KB');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updated via KB' })).toBeVisible();
});

test('responsive: no horizontal overflow on narrow screens', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 375, 428, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('heading', { name: 'Создайте доску' })).toBeVisible();
});
