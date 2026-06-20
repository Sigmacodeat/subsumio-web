interface SseConnection {
  brainId: string;
  send: (event: string, data: unknown) => void;
}

const sseConnections = new Set<SseConnection>();

export function addSseConnection(conn: SseConnection): void {
  sseConnections.add(conn);
}

export function removeSseConnection(conn: SseConnection): void {
  sseConnections.delete(conn);
}

export function broadcastSseEvent(brainId: string, event: string, data: unknown): void {
  for (const conn of sseConnections) {
    if (conn.brainId === brainId) conn.send(event, data);
  }
}

export function getSseConnectionCount(): number {
  return sseConnections.size;
}
