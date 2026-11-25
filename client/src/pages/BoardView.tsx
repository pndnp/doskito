import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import type { BoardMetadata, BoardState, ParsedDraft, TaskStatus } from '../lib/api';
import { Logo } from '../components/Common';
import { DeleteBoardModal, RenameBoardModal } from '../components/BoardModals';
import { InviteModal, LinkBanner, StatusBar } from '../components/BoardTools';
import { QuickAdd, STATUS_LABELS } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { TaskFormModal } from '../components/TaskModals';
import { AiPreview } from '../components/AiPreview';
import { api } from '../lib/api';
import { optimisticBoardUpdate, useOptimisticBoard } from '../lib/optimistic';
import { useToast } from '../components/Toast';
import { useSSE } from '../hooks/useSSE';
import { useNavigate } from 'react-router-dom';

export function BoardView({ board }: { board: BoardState }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState<TaskStatus | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem(`doskito_link_dismissed_${board.slug}`) === 'true',
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const optimistic = useOptimisticBoard(board.slug);
  const { showToast } = useToast();
  const { status, deleted } = useSSE(board.slug);
  const [activeDraft, setActiveDraft] = useState<ParsedDraft | null>(null);
  const draft = activeDraft ?? board.drafts[0];
  const empty = board.tasks.length === 0;

  function Column({ status, title }: { status: TaskStatus; title: string }) {
    const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });
    const tasks = board.tasks.filter((task) => task.status === status);
    return (
      <section
        ref={setNodeRef}
        className={`kanban-column${isOver ? ' kanban-column-over' : ''}`}
        aria-labelledby={`column-${status}`}
      >
        <div className="kanban-column-header">
          <h2 id={`column-${status}`} className={`column-title column-${status}`}>
            {title} · {tasks.length}
          </h2>
          <button
            className="icon-button column-add"
            aria-label={`Добавить в колонку ${title}`}
            onClick={() => setCreatingStatus(status)}
          >
            +
          </button>
        </div>
        <div className="kanban-tasks">
          {tasks.length === 0 ? (
            <div className="empty-drop-zone">Сюда попадут задачи</div>
          ) : (
            tasks.map((task, index) => (
              <DraggableTask key={task.id} id={task.id}>
                <TaskCard board={board} task={task} index={index} />
              </DraggableTask>
            ))
          )}
        </div>
      </section>
    );
  }

  function DraggableTask({ id, children }: { id: string; children: ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
    return (
      <div
        ref={setNodeRef}
        className={isDragging ? 'draggable-task draggable-task-active' : 'draggable-task'}
        style={
          transform
            ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
            : undefined
        }
      >
        <button
          className="drag-handle"
          aria-label="Перетащить задачу"
          {...listeners}
          {...attributes}
        >
          ⠿
        </button>
        {children}
      </div>
    );
  }
  const move = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const order =
        Math.max(
          0,
          ...board.tasks.filter((task) => task.status === status).map((task) => task.order),
        ) + 1;
      const rollback = await optimisticBoardUpdate(queryClient, board.slug, (current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId ? { ...task, status, order } : task,
        ),
      }));
      try {
        await api.patch(`/api/boards/${board.slug}/tasks/${taskId}`, { status, order });
      } catch (error) {
        rollback();
        showToast('Не удалось сохранить', 'error');
        throw error;
      }
    },
    onSettled: () => optimistic.invalidate(),
  });

  function dragEnd(event: DragEndEvent) {
    const status = event.over?.data.current?.status as TaskStatus | undefined;
    if (status) move.mutate({ taskId: String(event.active.id), status });
  }

  function dismissBanner() {
    try {
      localStorage.setItem(`doskito_link_dismissed_${board.slug}`, 'true');
    } catch {
      // Баннер скрывается на текущий просмотр даже при недоступном хранилище.
    }
    setBannerDismissed(true);
  }

  if (deleted) {
    return (
      <main className="page board-placeholder">
        <Logo />
        <h1>Доска удалена или недоступна</h1>
        <p>
          Владелец ссылки удалил доску для всех участников либо она была удалена после 30 дней без
          активности. Сохранённая ссылка больше не работает.
        </p>
        <a className="button button-outline" href="#/">
          Вернуться к моим доскам
        </a>
      </main>
    );
  }

  return (
    <main className="page board-page">
      <header className="board-header">
        <div className="board-header-left">
          <a href="#/" aria-label="К списку досок">
            <Logo />
          </a>
          <button
            className="board-name button button-secondary"
            aria-label="Переименовать доску"
            onClick={() => setRenaming(true)}
          >
            {board.name} <span aria-hidden="true">✎</span>
          </button>
        </div>
        <div className="board-header-right">
          <span className={`sse-status sse-status-${status}`}>
            {status === 'connected'
              ? 'Синхронизация'
              : status === 'reconnecting'
                ? 'Переподключение…'
                : 'Подключение…'}
          </span>
          <StatusBar board={board} />
          <button className="button button-outline" onClick={() => setInviting(true)}>
            Пригласить по ссылке
          </button>
          <button className="button button-danger" onClick={() => setDeleting(true)}>
            Удалить доску
          </button>
        </div>
      </header>
      {empty && !bannerDismissed && <LinkBanner slug={board.slug} close={dismissBanner} />}
      <div className={draft ? 'board-content board-content-blocked' : 'board-content'}>
        <fieldset className="board-fieldset" disabled={Boolean(draft)}>
          <QuickAdd
            board={board}
            onManualCreate={() => setCreatingStatus('todo')}
            onDraft={setActiveDraft}
          />
          <DndContext onDragEnd={dragEnd}>
            <div className="kanban">
              {board.columns.map((column) => (
                <Column key={column.id} status={column.id} title={STATUS_LABELS[column.id]} />
              ))}
            </div>
          </DndContext>
        </fieldset>
      </div>
      {draft && <AiPreview slug={board.slug} draft={draft} close={() => setActiveDraft(null)} />}
      {renaming && <RenameBoardModal board={board} close={() => setRenaming(false)} />}
      {deleting && (
        <DeleteBoardModal
          board={board as BoardMetadata}
          close={() => {
            setDeleting(false);
            if (!localStorage.getItem('doskito_boards')?.includes(board.slug)) navigate('/');
          }}
        />
      )}
      {inviting && <InviteModal board={board} close={() => setInviting(false)} />}
      {creatingStatus && (
        <TaskFormModal
          board={board}
          initialStatus={creatingStatus}
          close={() => setCreatingStatus(null)}
        />
      )}
    </main>
  );
}
