import { WebSocketServer } from 'ws';

let wss = null;

export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('[WS] Client connected');
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'AquaAlert live feed active' }));

    ws.on('close', () => console.log('[WS] Client disconnected'));
    ws.on('error', (err) => console.error('[WS] Error:', err.message));
  });

  console.log('[WS] WebSocket server initialized on /ws');
}

// Broadcast to ALL connected dashboard clients
export function broadcast(eventType, payload) {
  if (!wss) return;

  const message = JSON.stringify({
    type: eventType,
    payload,
    timestamp: new Date().toISOString(),
  });

  let count = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
      count++;
    }
  });

  console.log(`[WS] Broadcast "${eventType}" to ${count} clients`);
}

/*
  Event types emitted:
  - ALERT_CREATED        → new alert from LangGraph pipeline
  - CONFIDENCE_UPDATE    → reporter response changed confidence score
  - ALERT_ESCALATED      → confidence ≥ 0.90, status → CRITICAL
  - ALERT_DISMISSED      → confidence dropped < 0.40
  - GRIEVANCE_RECEIVED   → new NadiBot grievance
  - GRIEVANCE_UPDATED    → grievance status changed
*/