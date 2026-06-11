import { useEffect, useRef } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export default function useWebSocket(setAlerts) {
  const wsRef = useRef(null);

  useEffect(() => {
    const connect = () => {
      const wsUrl = BACKEND_URL
        ? BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws'
        : `ws://${window.location.hostname}:5000/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const { type, payload } = JSON.parse(e.data);

          if (type === 'ALERT_CREATED') {
            setAlerts(prev => [payload, ...prev]);
          }

          if (type === 'CONFIDENCE_UPDATE') {
            setAlerts(prev => prev.map(a =>
              a.alertId === payload.alertId
                ? { ...a,
                    currentConfidence:  payload.newConfidence,
                    confidenceLabel:    payload.confidenceLabel,
                    reportersConfirmed: payload.yesCount,
                    status:             payload.status,
                    reporterResponses:  a.reporterResponses?.map(r =>
                      r.phone === payload.phone
                        ? { ...r, response: payload.reporterResponse }
                        : r
                    ),
                  }
                : a
            ));
          }

          if (type === 'ALERT_ESCALATED') {
            setAlerts(prev => prev.map(a =>
              a.alertId === payload.alertId
                ? { ...a, status: 'ESCALATED', confidenceLabel: 'CRITICAL' }
                : a
            ));
          }
        } catch (err) {
          console.error('[WS parse]', err);
        }
      };

      ws.onclose = () => setTimeout(connect, 3000);
    };

    connect();
    return () => wsRef.current?.close();
  }, [setAlerts]);
}