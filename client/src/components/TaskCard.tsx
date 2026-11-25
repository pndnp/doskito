import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardState, Task, TaskPriority, TaskStatus } from '../lib/api';
import { api } from '../lib/api';
import { STATUS_LABELS } from './QuickAdd';
import { DeleteTaskModal, TaskFormModal } from './TaskModals';
import { useToast } from './Toast';

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

function localDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day);
}

export function TaskCard({ board, task, index }: { board: BoardState; task: Task; index: number }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const move = useMutation({
    mutationFn: (status: TaskStatus) =>
      api.patch(`/api/boards/${board.slug}/tasks/${task.id}`, { status }),
    onSuccess: () => {
      setMenu(false);
      void queryClient.invalidateQueries({ queryKey: ['board', board.slug] });
    },
    onError: () => showToast('Не удалось сохранить', 'error'),
  });
  const overdue =
    task.dueDate !== null &&
    task.status !== 'done' &&
    localDate(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
  const style = {
    '--r': `${index % 2 === 0 ? -0.6 : 0.6}deg`,
    '--a': `var(--${task.status === 'todo' ? 'coral' : task.status === 'done' ? 'mint' : 'yellow'})`,
  } as CSSProperties;

  return (
    <>
      <article className={`task-card card${overdue ? ' task-card-overdue' : ''}`} style={style}>
        <div className="task-card-heading">
          <h3>{task.title}</h3>
          <div className="board-card-menu">
            <button
              className="icon-button"
              aria-label={`Меню задачи ${task.title}`}
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              ···
            </button>
            {menu && (
              <div className="dropdown">
                <button onClick={() => setEditing(true)}>Редактировать</button>
                {(Object.keys(STATUS_LABELS) as TaskStatus[])
                  .filter((status) => status !== task.status)
                  .map((status) => (
                    <button key={status} onClick={() => move.mutate(status)}>
                      Переместить в «{STATUS_LABELS[status]}»
                    </button>
                  ))}
                <button onClick={() => setDeleting(true)}>Удалить</button>
              </div>
            )}
          </div>
        </div>
        <div className="task-tags">
          <span
            className={
              task.priority === 'high' || task.priority === 'critical' ? 'priority-urgent' : ''
            }
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className={`task-due${overdue ? ' task-due-overdue' : ''}`}>
          {task.dueDate
            ? `до ${new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).format(localDate(task.dueDate))}`
            : 'без срока'}
        </div>
      </article>
      {editing && (
        <TaskFormModal
          board={board}
          initialStatus={task.status}
          task={task}
          close={() => {
            setEditing(false);
            setMenu(false);
          }}
        />
      )}
      {deleting && (
        <DeleteTaskModal
          board={board}
          task={task}
          close={() => {
            setDeleting(false);
            setMenu(false);
          }}
        />
      )}
    </>
  );
}
