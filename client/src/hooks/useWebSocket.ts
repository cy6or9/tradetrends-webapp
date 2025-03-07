import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  data: {
    symbol: string;
    price: number;
    change: number;
    timestamp: string;
  };
}

const RECONNECT_DELAY = 2000; // 2 seconds
const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    try {
      // Clear any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Check max reconnection attempts
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached');
        return;
      }

      // Get the correct WebSocket URL based on current protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      console.log('Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'stockUpdate' && message.data?.symbol && message.data?.price) {
            console.log('Received stock update:', message);
            setLastMessage(message);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket disconnected: ${event.code} - ${event.reason}`);
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        reconnectAttempts.current++;

        console.log(`Attempting to reconnect (${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Log additional connection details for debugging
        console.log('Connection details:', {
          protocol,
          host,
          url: wsUrl,
          readyState: ws.readyState
        });
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [connect]);

  return {
    isConnected,
    lastMessage
  };
}