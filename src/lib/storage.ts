/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChatMessage {
  id: string;
  text: string;
  isModel: boolean;
  timestamp: number;
}

const STORAGE_KEY = "hunter_chat_history";

export const StorageService = {
  saveMessage: (text: string, isModel: boolean): ChatMessage => {
    const history = StorageService.getHistory();
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      text,
      isModel,
      timestamp: Date.now(),
    };
    
    // Append to history
    const updatedHistory = [...history, newMessage];
    
    // Keep only last 1000 messages to prevent storage bloat
    const trimmedHistory = updatedHistory.slice(-1000);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
    return newMessage;
  },

  getHistory: (): ChatMessage[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to load history from local storage", e);
      return [];
    }
  },

  clearHistory: () => {
    localStorage.removeItem(STORAGE_KEY);
  }
};
