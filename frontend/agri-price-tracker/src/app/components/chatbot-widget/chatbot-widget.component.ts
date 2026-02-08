import { Component, OnInit, Input, Inject, PLATFORM_ID, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatbotService, ChatRequest } from '../../services/chatbot.service';
import { Subscription } from 'rxjs';
import { timeout, finalize } from 'rxjs/operators';

export interface ChatMessage {
  id: number;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  type?: 'text' | 'price' | 'weather' | 'suggestion';
}

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot-widget.component.html',
  styleUrls: ['./chatbot-widget.component.css']
})
export class ChatbotWidgetComponent implements OnInit, AfterViewChecked, OnDestroy {
  @Input() focusOnPrices = true;
  @ViewChild('chatBody') private chatBody!: ElementRef;
  
  isOpen = false;
  currentMessage = '';
  isTyping = false;
  sessionId = '';
  messages: ChatMessage[] = [];
  suggestedQuestions: string[] = [
    'Maize prices today',
    'Bean price trends',
    'Best time to sell tomatoes'
  ];

  private chatSubscription?: Subscription;
  private shouldScrollToBottom = false;

  // OPTIMIZATION: Map for instant local responses (0ms latency)
  private readonly LOCAL_INTENTS: Record<string, string> = {
    'hi': 'Hello! I am your Agri-Price assistant. Ask me about current market prices!',
    'hey': 'Hey! I am your Agri-Price assistant. Ask me about current market prices!',
    'hello': 'Hi there! Ready to check the latest market rates?',
    'help': 'I can help you with:<br>• <strong>Current Prices</strong> (e.g., "Price of Maize")<br>• <strong>Trends</strong> (e.g., "Is bean price rising?")<br>• <strong>Advice</strong> (e.g., "When to sell?")',
    'options': 'Try asking about: <br>• Maize prices in Nairobi<br>• Best market for Potatoes<br>• Weather forecast',
  };

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private chatbotService: ChatbotService
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeBrowserFeatures();
      this.sessionId = this.generateSessionId();
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy() {
    if (this.chatSubscription) {
      this.chatSubscription.unsubscribe();
    }
  }

  private generateSessionId(): string {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private initializeBrowserFeatures() {
    if (typeof window !== 'undefined') {
      window.addEventListener('openChatbot', () => {
        this.isOpen = true;
        this.scrollToBottomTrigger();
      });
    }
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.scrollToBottomTrigger();
    }
  }

  sendMessage() {
    if (!this.currentMessage.trim()) return;

    const messageContent = this.currentMessage.trim();
    
    // 1. Add User Message
    this.addMessage(messageContent, 'user');
    
    // Clear input immediately
    this.currentMessage = '';
    this.isTyping = true;
    this.scrollToBottomTrigger();

    // 2. OPTIMIZATION: Check Local Intents First (Instant Response)
    const lowerMsg = messageContent.toLowerCase();
    if (this.LOCAL_INTENTS[lowerMsg]) {
      setTimeout(() => {
        this.addMessage(this.LOCAL_INTENTS[lowerMsg], 'bot');
        this.isTyping = false;
      }, 500); 
      return;
    }

    // 3. Send to Backend API for real data
    const chatRequest: ChatRequest = {
      message: messageContent,
      session_id: this.sessionId,
      context: { focusOnPrices: this.focusOnPrices }
    };

    if (this.chatSubscription) {
      this.chatSubscription.unsubscribe();
    }

    this.chatSubscription = this.chatbotService.sendMessage(chatRequest).pipe(
      timeout(150000), // Safety: Don't hang forever
      finalize(() => {
        this.isTyping = false;
        this.scrollToBottomTrigger();
      })
    ).subscribe({
      next: (response) => {
        this.addMessage(response.response, 'bot');
      },
      error: (error) => {
        console.error('Chat error:', error);
        this.addMessage('⚠️ Network issue. Please check your connection or try again later.', 'bot');
      }
    });
  }

  sendQuickMessage(message: string) {
    this.currentMessage = message;
    this.sendMessage();
  }

  private addMessage(content: string, sender: 'user' | 'bot') {
    this.messages.push({
      id: this.messages.length + 1,
      content: content,
      sender: sender,
      timestamp: new Date(),
      type: 'text'
    });
    this.scrollToBottomTrigger();
  }

  // --- RESTORED HELPERS FOR HTML TEMPLATE ---
  
  formatMessage(content: string): string {
    // Returns the content as-is so innerHTML can render HTML tags (<b>, <br>) sent by bot
    return content;
  }

  formatTime(timestamp: Date): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ------------------------------------------

  private scrollToBottomTrigger() {
    this.shouldScrollToBottom = true;
  }

  private scrollToBottom() {
    if (isPlatformBrowser(this.platformId) && this.chatBody) {
      try {
        this.chatBody.nativeElement.scrollTop = this.chatBody.nativeElement.scrollHeight;
      } catch(err) { }
    }
  }
}