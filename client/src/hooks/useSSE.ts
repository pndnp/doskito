import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBoardActions } from '../store/boards';
import { useToast } from '../components/Toast';

export type SseStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export function useSSE(slug: string, enabled = true) {
  const [status, setStatus] = useState<SseStatus>('connecting');
  const [deleted, setDeleted] = useState(false);
  const queryClient = useQueryClient();
  const { remove } = useBoardActions();
  const { showToast } = useToast();

  useEffect(() => {
    if (!enabled || deleted) {
      setStatus('closed');
      return;
    }
    const source = new EventSource(`/api/boards/${slug}/sse`, { withCredentials: true });
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['board', slug] });
    };
    const events = ['task_created', 'task_updated', 'task_deleted', 'board_updated', 'user_joined'];
    for (const event of events) source.addEventListener(event, refresh);
    source.addEventListener('ready', () => {
      setStatus('connected');
      void queryClient.invalidateQueries({ queryKey: ['board', slug] });
    });
    source.addEventListener('draft_finalized', refresh);
    source.addEventListener('draft_discarded', (event) => {
      refresh();
      const payload = JSON.parse((event as MessageEvent<string>).data) as { reason: string };
      if (payload.reason === 'expired') showToast('Время черновика истекло', 'error');
    });
    source.addEventListener('board_deleted', () => {
      remove(slug);
      setDeleted(true);
      setStatus('closed');
      source.close();
    });
    source.onerror = () => {
      if (!deleted) setStatus('reconnecting');
    };
    return () => {
      setStatus('closed');
      source.close();
    };
  }, [slug, enabled, deleted, queryClient, remove, showToast]);

  return { status, deleted };
}
