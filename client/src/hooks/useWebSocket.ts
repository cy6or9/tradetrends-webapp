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

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(true); 
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  return {
    isConnected,
    lastMessage
  };
}