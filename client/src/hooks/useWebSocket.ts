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
  // Temporarily disable WebSocket functionality
  return {
    isConnected: false,
    lastMessage: null as WebSocketMessage | null
  };
}