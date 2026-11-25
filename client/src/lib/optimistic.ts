import { useQueryClient } from '@tanstack/react-query';
import type { BoardState } from '../lib/api';

export function useOptimisticBoard(slug: string) {
  const queryClient = useQueryClient();
  return {
    queryClient,
    update: (change: (board: BoardState) => BoardState) =>
      optimisticBoardUpdate(queryClient, slug, change),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['board', slug] }),
  };
}

export async function optimisticBoardUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  update: (board: BoardState) => BoardState,
): Promise<() => void> {
  const queryKey = ['board', slug];
  await queryClient.cancelQueries({ queryKey });
  const snapshot = queryClient.getQueryData<BoardState>(queryKey);
  if (snapshot) queryClient.setQueryData(queryKey, update(snapshot));
  return () => {
    if (snapshot) queryClient.setQueryData(queryKey, snapshot);
  };
}
