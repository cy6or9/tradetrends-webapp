import { useEffect, useRef, useState } from 'react';
import { stockCache } from '@/lib/stockCache';

interface WebSocketMessage {
  type: string;
  data: any;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;

  useEffect(() => {
    const getReconnectDelay = () => {
      // Exponential backoff with a max of 30 seconds
      return Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts.current), 30000);
    };

    const connectWebSocket = () => {
      try {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('WebSocket already connected');
          return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/socket`;
        console.log('Attempting WebSocket connection to:', wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected successfully');
          setIsConnected(true);
          reconnectAttempts.current = 0;
          if (reconnectTimeoutRef.current) {
            window.clearTimeout(reconnectTimeoutRef.current);
          }
        };

        ws.onclose = (event) => {
          console.log(`WebSocket disconnected with code ${event.code}`);
          setIsConnected(false);

          if (reconnectAttempts.current < maxReconnectAttempts) {
            const delay = getReconnectDelay();
            console.log(`Attempting reconnect in ${delay/1000}s (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
            reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, delay);
            reconnectAttempts.current++;
          } else {
            console.log('Max reconnection attempts reached');
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            setLastMessage(message);

            // Handle initial data load
            if (message.type === 'initial_data' && Array.isArray(message.data)) {
              stockCache.updateStocks(message.data);
              console.log('Updated cache with initial data:', message.data.length, 'stocks');
            }

            // Handle real-time updates
            if (message.type === 'stock_update' && message.data) {
              stockCache.updateStock(message.data);
              console.log('Updated stock in cache:', message.data.symbol);
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = getReconnectDelay();
          reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, delay);
          reconnectAttempts.current++;
        }
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    lastMessage
  };
}