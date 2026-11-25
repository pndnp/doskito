import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type BoardState, type ParsedDraft, type TaskStatus } from '../lib/api';
import { useToast } from './Toast';

export function QuickAdd({
  board,
  onManualCreate,
  onDraft,
}: {
  board: BoardState;
  onManualCreate: () => void;
  onDraft: (draft: ParsedDraft) => void;
}) {
  const [value, setValue] = useState('');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const parse = useMutation({
    mutationFn: () =>
      api.post<ParsedDraft>(`/api/boards/${board.slug}/tasks/parsed`, { rawText: value }),
    onSuccess: (response) => {
      onDraft(response.data);
      setValue('');
      void queryClient.invalidateQueries({ queryKey: ['board', board.slug] });
    },
    onError: () => showToast('Не удалось разобрать задачу. Создайте вручную.', 'error'),
  });
  const empty = board.tasks.length === 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim() === '') return;
    parse.mutate();
  }

  return (
    <div className="quick-add">
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="quick-add-input">
          Новая задача
        </label>
        <input
          id="quick-add-input"
          autoComplete="off"
          className={empty ? 'quick-add-input quick-add-input-empty' : 'quick-add-input'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={500}
          disabled={parse.isPending}
          placeholder={
            empty
              ? 'Напишите, что нужно сделать, а ИИ разберёт на подзадачи'
              : 'Что нужно сделать? Например: подготовить релиз до пятницы'
          }
        />
        <button className="button button-primary quick-add-button" disabled={parse.isPending}>
          {parse.isPending ? (
            <>
              <span className="spinner" aria-hidden="true" /> Разбираем…
            </>
          ) : (
            'Разобрать'
          )}
        </button>
      </form>
      {empty && !parse.isPending && (
        <div className="quick-add-examples">
          <span>Попробуйте:</span>
          {[
            'Подготовить релиз до пятницы',
            'Собрать вещи в поездку на выходные',
            'Написать отчёт за квартал',
          ].map((example) => (
            <button
              key={example}
              className="button button-secondary"
              onClick={() => setValue(example)}
            >
              {example}
            </button>
          ))}
        </div>
      )}
      {parse.isError && (
        <button className="button button-outline" onClick={onManualCreate}>
          Создать вручную
        </button>
      )}
    </div>
  );
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Сделать',
  progress: 'Делаю',
  done: 'Готово',
};
