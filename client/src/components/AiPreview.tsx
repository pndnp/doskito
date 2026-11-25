import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ParsedDraft, ParsedFields, TaskPriority } from '../lib/api';
import { api } from '../lib/api';
import { useToast } from './Toast';

export function AiPreview({
  slug,
  draft,
  close,
}: {
  slug: string;
  draft: ParsedDraft;
  close: () => void;
}) {
  const [fields, setFields] = useState<ParsedFields>(draft.parsedFields);
  const [tags, setTags] = useState(draft.parsedFields.tags.join(', '));
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const save = useMutation({
    mutationFn: async () => {
      const normalized = {
        ...fields,
        tags: [
          ...new Set(
            tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ],
      };
      await api.patch(`/api/boards/${slug}/drafts/${draft.draftId}`, normalized);
      await api.post(`/api/boards/${slug}/drafts/${draft.draftId}/finalize`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', slug] });
      showToast('Задачи сохранены на доску');
      close();
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', slug] });
    },
  });
  const discard = useMutation({
    mutationFn: () => api.post(`/api/boards/${slug}/drafts/${draft.draftId}/discard`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', slug] });
      close();
    },
  });
  const busy = save.isPending || discard.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <section className="ai-preview panel" aria-label="Черновик задачи">
      <span className="ai-preview-label">ИИ нарисовал черновик. Поправьте, что нужно</span>
      <form onSubmit={submit}>
        <label htmlFor="draft-title">Название</label>
        <input
          id="draft-title"
          value={fields.title}
          onChange={(event) => setFields({ ...fields, title: event.target.value })}
          minLength={1}
          maxLength={200}
          required
        />
        <div className="ai-preview-fields">
          <label htmlFor="draft-priority">Приоритет</label>
          <select
            id="draft-priority"
            value={fields.priority}
            onChange={(event) =>
              setFields({ ...fields, priority: event.target.value as TaskPriority })
            }
          >
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
            <option value="critical">Критический</option>
          </select>
          <label htmlFor="draft-date">Срок</label>
          <input
            id="draft-date"
            type="date"
            value={fields.dueDate ?? ''}
            onChange={(event) => setFields({ ...fields, dueDate: event.target.value || null })}
          />
          <label htmlFor="draft-tags">Теги</label>
          <input id="draft-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        </div>
        <fieldset disabled={busy}>
          {fields.subTasks.length > 0 && <legend>Подзадачи</legend>}
          {fields.subTasks.map((subTask, index) => (
            <div className="draft-subtask" key={index}>
              <label className="sr-only" htmlFor={`subtask-${index}`}>
                Подзадача {index + 1}
              </label>
              <input
                id={`subtask-${index}`}
                value={subTask.title}
                maxLength={200}
                onChange={(event) => {
                  const subTasks = fields.subTasks.map((item, itemIndex) =>
                    itemIndex === index ? { title: event.target.value } : item,
                  );
                  setFields({ ...fields, subTasks });
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Удалить подзадачу ${index + 1}`}
                onClick={() =>
                  setFields({ ...fields, subTasks: fields.subTasks.filter((_, i) => i !== index) })
                }
              >
                ×
              </button>
            </div>
          ))}
          {fields.subTasks.length < 10 && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                setFields({ ...fields, subTasks: [...fields.subTasks, { title: '' }] })
              }
            >
              Добавить подзадачу
            </button>
          )}
        </fieldset>
        {(save.isError || discard.isError) && (
          <p role="alert">
            Не удалось сохранить изменения. Данные формы сохранены, повторите попытку.
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => discard.mutate()}
          >
            {discard.isPending ? 'Отменяем…' : 'Отмена'}
          </button>
          <button className="button button-mint" type="submit" disabled={busy}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить на доску'}
          </button>
        </div>
      </form>
    </section>
  );
}
