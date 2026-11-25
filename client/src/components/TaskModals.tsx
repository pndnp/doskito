import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  errorMessage,
  type BoardState,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../lib/api';
import { Modal } from './BoardModals';
import { STATUS_LABELS } from './QuickAdd';
import { useToast } from './Toast';

interface TaskFields {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
}

const emptyFields = (status: TaskStatus): TaskFields => ({
  title: '',
  status,
  priority: 'medium',
  dueDate: null,
  tags: [],
});

export function TaskFormModal({
  board,
  initialStatus,
  task,
  close,
}: {
  board: BoardState;
  initialStatus: TaskStatus;
  task?: Task;
  close: () => void;
}) {
  const [fields, setFields] = useState<TaskFields>(
    task ? { ...emptyFields(task.status), ...task } : emptyFields(initialStatus),
  );
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (updatedFields: Partial<TaskFields>) =>
      task
        ? api.patch<Task>(`/api/boards/${board.slug}/tasks/${task.id}`, updatedFields)
        : api.post<Task>(`/api/boards/${board.slug}/tasks`, {
            title: updatedFields.title ?? '',
            status: updatedFields.status ?? 'todo',
            priority: updatedFields.priority ?? 'medium',
            dueDate: updatedFields.dueDate ?? null,
            tags: updatedFields.tags ?? [],
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', board.slug] });
      close();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const uniqueTags = [
      ...new Set(
        tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
    if (uniqueTags.length > 10 || uniqueTags.some((tag) => tag.length > 30)) return;

    if (task) {
      const changes: Partial<TaskFields> = {};
      if (fields.title !== task.title) changes.title = fields.title;
      if (fields.status !== task.status) changes.status = fields.status;
      if (fields.priority !== task.priority) changes.priority = fields.priority;
      if (fields.dueDate !== task.dueDate) changes.dueDate = fields.dueDate;
      if (JSON.stringify(fields.tags) !== JSON.stringify(task.tags)) changes.tags = uniqueTags;
      mutation.mutate(changes);
    } else {
      mutation.mutate({ ...fields, tags: uniqueTags });
    }
  }

  return (
    <Modal title={task ? 'Редактировать задачу' : 'Новая задача'}>
      <form onSubmit={submit} className="task-form">
        <label htmlFor="task-title">Название</label>
        <input
          id="task-title"
          value={fields.title}
          onChange={(event) => setFields({ ...fields, title: event.target.value })}
          minLength={1}
          maxLength={200}
          required
          autoFocus
        />
        <label htmlFor="task-status">Колонка</label>
        <select
          id="task-status"
          value={fields.status}
          onChange={(event) => setFields({ ...fields, status: event.target.value as TaskStatus })}
        >
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="task-priority">Приоритет</label>
        <select
          id="task-priority"
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
        <label htmlFor="task-date">Срок</label>
        <input
          id="task-date"
          type="date"
          value={fields.dueDate ?? ''}
          onChange={(event) => {
            if (fields.dueDate !== event.target.value) {
              setFields({ ...fields, dueDate: event.target.value || null });
            }
          }}
        />
        <label htmlFor="task-tags">Теги через запятую (до 10)</label>
        <input id="task-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        {mutation.isError && (
          <p className="form-error" role="alert">
            {errorMessage(mutation.error, 'Не удалось сохранить задачу. Проверьте поля.')}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={close}>
            Отмена
          </button>
          <button className="button button-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteTaskModal({
  board,
  task,
  close,
}: {
  board: BoardState;
  task: Task;
  close: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/boards/${board.slug}/tasks/${task.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', board.slug] });
      showToast('Задача удалена');
      close();
    },
  });
  return (
    <Modal title="Удалить задачу?">
      <p>Задача «{task.title}» будет удалена. Это действие нельзя отменить.</p>
      {mutation.isError && <p role="alert">Не удалось удалить задачу. Повторите попытку.</p>}
      <div className="modal-actions">
        <button className="button button-outline" autoFocus onClick={close}>
          Отмена
        </button>
        <button
          className="button button-danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Удаляем…' : 'Удалить'}
        </button>
      </div>
    </Modal>
  );
}
