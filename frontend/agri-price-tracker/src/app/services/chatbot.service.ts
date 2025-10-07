import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  context?: any;
}

export interface ChatResponse {
  response: string;
  session_id: string;
  conversation_id: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  constructor(private apiService: ApiService) {}

  sendMessage(chatData: ChatRequest): Observable<ChatResponse> {
    return this.apiService.post<ChatResponse>('/chatbot/message', chatData).pipe(
      map(response => response.data!)
    );
  }

  getConversation(sessionId: string): Observable<any> {
    return this.apiService.get<any>(`/chatbot/conversation/${sessionId}`).pipe(
      map(response => response.data!)
    );
  }

  getUserConversations(): Observable<any[]> {
    return this.apiService.get<any[]>('/chatbot/conversations').pipe(
      map(response => response.data || [])
    );
  }
}