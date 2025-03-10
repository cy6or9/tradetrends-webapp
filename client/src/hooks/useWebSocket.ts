import { useEffect, useRef, useState } from 'react';
import { stockCache } from '@/lib/stockCache';

interface WebSocketMessage {
  type: string;
  data: {
    symbol: string;
    price: number;
    change: number;
    timestamp: string;
  };
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        console.log('Attempting WebSocket connection to:', wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected successfully');
          setIsConnected(true);
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected, attempting reconnect in 5s');
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            setLastMessage(message);
            console.log('Received WebSocket message:', message);

            // Handle initial data load
            if (message.type === 'initial_data' && Array.isArray(message.data)) {
              stockCache.updateStocks(message.data);
              console.log('Updated cache with initial data:', message.data.length, 'stocks');
            }

            // Handle real-time updates
            if (message.type === 'stock_update' && message.data) {
              const stock = stockCache.getStock(message.data.symbol);
              if (stock) {
                stockCache.updateStock({
                  ...stock,
                  price: message.data.price,
                  changePercent: message.data.change,
                  lastUpdate: new Date().toISOString(),
                  nextUpdate: new Date(Date.now() + 5 * 60 * 1000).toISOString()
                });
                console.log('Updated stock in cache:', message.data.symbol);
              }
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    lastMessage
  };
}