import type { ServerResponse } from 'node:http';
import type { SseSubscriber } from '../../src/services/events.js';

export interface TestSseClient extends SseSubscriber {
  chunks: string[];
  closedByServer: boolean;
  close: () => void;
}

export function createTestSseClient(clientId: string): TestSseClient {
  const client: TestSseClient = {
    clientId,
    chunks: [],
    closedByServer: false,
    response: {} as ServerResponse,
    close: () => {
      client.closedByServer = true;
      (client.response as { destroyed: boolean }).destroyed = true;
    },
  };
  client.response = {
    write(chunk: string | Uint8Array) {
      if (client.closedByServer) throw new Error('Запись в закрытый SSE-поток');
      client.chunks.push(String(chunk));
      return true;
    },
    end() {
      client.close();
      return client.response;
    },
    destroy() {
      client.close();
      return client.response;
    },
    destroyed: false,
    writableEnded: false,
  } as unknown as ServerResponse;
  return client;
}
