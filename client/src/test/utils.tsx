import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from '../App';
import { ToastProvider } from '../components/Toast';
import { api } from '../lib/api';
import type { BoardMetadata } from '../lib/api';

export function metadata(slug = 'board001', name = 'Моя доска'): BoardMetadata {
  return {
    slug,
    name,
    color: '#B69CFF',
    updatedAt: new Date().toISOString(),
    totalTasks: 0,
    doneTasks: 0,
  };
}

export function mockApi() {
  const post = vi.spyOn(api, 'post');
  const get = vi.spyOn(api, 'get');
  const patch = vi.spyOn(api, 'patch');
  const remove = vi.spyOn(api, 'delete');
  return { post, get, patch, remove };
}

export function renderApp(route = '/') {
  window.location.hash = `#${route}`;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
