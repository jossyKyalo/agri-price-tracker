import { Component, OnInit, Input, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatbotService, ChatRequest } from '../../services/chatbot.service';

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
export class ChatbotWidgetComponent implements OnInit {
  @Input() focusOnPrices = true;
  
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

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private chatbotService: ChatbotService
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Initialize chatbot with price-focused suggestions
      this.initializeBrowserFeatures();
      this.sessionId = this.generateSessionId();
    }
    this.updateSuggestions();
  }

  private generateSessionId(): string {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private initializeBrowserFeatures() {
    // Listen for chatbot open events - only in browser
    if (typeof window !== 'undefined') {
      window.addEventListener('openChatbot', () => {
        this.isOpen = true;
        if (this.messages.length === 0) {
          this.updateSuggestions();
        }
      });
    }
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen && this.messages.length === 0) {
      this.updateSuggestions();
    }
  }

  sendMessage() {
    if (!this.currentMessage.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: this.messages.length + 1,
      content: this.currentMessage,
      sender: 'user',
      timestamp: new Date()
    };
    
    this.messages.push(userMessage);
    
    // Clear input and show typing
    const messageToProcess = this.currentMessage;
    this.currentMessage = '';
    this.isTyping = true;
    
    // Send message to backend
    const chatRequest: ChatRequest = {
      message: messageToProcess,
      session_id: this.sessionId,
      context: { focusOnPrices: this.focusOnPrices }
    };

    this.chatbotService.sendMessage(chatRequest).subscribe({
      next: (response) => {
        this.isTyping = false;
        
        const botMessage: ChatMessage = {
          id: this.messages.length + 1,
          content: response.response,
          sender: 'bot',
          timestamp: new Date(),
          type: 'text'
        };
        
        this.messages.push(botMessage);
        this.scrollToBottom();
      },
      error: (error) => {
        this.isTyping = false;
        console.error('Chat error:', error);
        
        // Fallback response
        const botMessage: ChatMessage = {
          id: this.messages.length + 1,
          content: 'Sorry, I\'m having trouble connecting right now. Please try again later.',
          sender: 'bot',
          timestamp: new Date(),
          type: 'text'
        };
        
        this.messages.push(botMessage);
        this.scrollToBottom();
      }
    });
    
    this.scrollToBottom();
  }

  sendQuickMessage(message: string) {
    this.currentMessage = message;
    this.sendMessage();
  }

   
  generateBotResponse(userMessage: string) {
    setTimeout(() => {
      this.addBotResponse(userMessage);
      this.isTyping = false;
      this.scrollToBottom();
    }, 1500);
  }

  addBotResponse(userMessage: string) {
    let response = '';
    let type: 'text' | 'price' | 'weather' | 'suggestion' = 'text';
    
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
      type = 'price';
      if (lowerMessage.includes('maize')) {
        response = `💰 <strong>Current Maize Prices:</strong><br>
        • Central Kenya: KSh 50/kg (↗️ +4%)<br>
        • Western Kenya: KSh 48/kg (➡️ stable)<br>
        • Rift Valley: KSh 52/kg (↗️ +6%)<br>
        • Eastern Kenya: KSh 47/kg (↘️ -2%)<br>
        <br>📈 <strong>7-day prediction:</strong> Expected to rise to KSh 55/kg<br>
        💡 <em>Good time to sell if you have stock!</em>`;
      } else if (lowerMessage.includes('tomato')) {
        response = `🍅 <strong>Current Tomato Prices:</strong><br>
        • Nairobi: KSh 42/kg (➡️ stable)<br>
        • Mombasa: KSh 45/kg (↗️ +7%)<br>
        • Kisumu: KSh 40/kg (↘️ -5%)<br>
        • Nakuru: KSh 44/kg (↗️ +5%)<br>
        <br>📈 <strong>Trend:</strong> Stable with slight increase expected<br>
        💡 <em>High demand in coastal markets!</em>`;
      } else if (lowerMessage.includes('bean')) {
        response = `🫘 <strong>Current Bean Prices:</strong><br>
        • Western Kenya: KSh 90/kg (↘️ -2%)<br>
        • Central Kenya: KSh 88/kg (➡️ stable)<br>
        • Eastern Kenya: KSh 85/kg (↘️ -6%)<br>
        <br>📈 <strong>Prediction:</strong> Prices may drop to KSh 85/kg<br>
        💡 <em>Consider holding if possible!</em>`;
      } else {
        response = `📊 <strong>Today's Top Crop Prices:</strong><br>
        • Maize: KSh 50/kg (↗️ +4%)<br>
        • Beans: KSh 90/kg (↘️ -2%)<br>
        • Tomatoes: KSh 42/kg (➡️ stable)<br>
        • Potatoes: KSh 35/kg (↗️ +9%)<br>
        • Onions: KSh 55/kg (↘️ -5%)<br>
        <br>Which specific crop would you like detailed information about?`;
      }
      this.suggestedQuestions = ['Price predictions', 'Best markets to sell', 'Compare regions'];
    } else if (lowerMessage.includes('predict') || lowerMessage.includes('forecast')) {
      type = 'suggestion';
      response = `🔮 <strong>7-Day Price Predictions:</strong><br>
      <br>📈 <strong>Expected to Rise:</strong><br>
      • Maize: KSh 50 → KSh 55 (+10%)<br>
      • Potatoes: KSh 35 → KSh 38 (+9%)<br>
      <br>📉 <strong>Expected to Fall:</strong><br>
      • Beans: KSh 90 → KSh 85 (-6%)<br>
      • Onions: KSh 55 → KSh 52 (-5%)<br>
      <br>➡️ <strong>Stable:</strong><br>
      • Tomatoes: KSh 42 → KSh 43 (+2%)<br>
      <br>💡 <em>Predictions based on ML analysis with 95% accuracy</em>`;
      this.suggestedQuestions = ['Best time to sell', 'Market recommendations', 'Price alerts'];
    } else if (lowerMessage.includes('compare') || lowerMessage.includes('region')) {
      response = `📍 <strong>Regional Price Comparison:</strong><br>
      <br>🌽 <strong>Maize Prices by Region:</strong><br>
      • Rift Valley: KSh 52/kg (Highest)<br>
      • Central Kenya: KSh 50/kg<br>
      • Western Kenya: KSh 48/kg<br>
      • Eastern Kenya: KSh 47/kg (Lowest)<br>
      <br>💡 <strong>Best Markets:</strong><br>
      • Nakuru Market (Rift Valley)<br>
      • Nairobi Central Market<br>
      <br>🚚 <em>Consider transport costs when choosing markets!</em>`;
      this.suggestedQuestions = ['Transport costs', 'Market contacts', 'Selling tips'];
    } else if (lowerMessage.includes('sell') || lowerMessage.includes('market')) {
      response = `🏪 <strong>Best Selling Strategies:</strong><br>
      <br>⏰ <strong>Timing:</strong><br>
      • Maize: Sell now (prices rising)<br>
      • Beans: Wait 1-2 weeks (prices may recover)<br>
      • Tomatoes: Sell immediately (stable demand)<br>
      <br>📍 <strong>Best Markets:</strong><br>
      • Urban markets: Higher prices<br>
      • Processing companies: Bulk sales<br>
      • Cooperatives: Better negotiation<br>
      <br>💰 <em>Always negotiate and avoid middlemen!</em>`;
      this.suggestedQuestions = ['Negotiation tips', 'Cooperative contacts', 'Quality standards'];
    } else {
      response = `Thank you for your question! I specialize in agricultural pricing. You can ask me about:<br>
      <br>💰 Current crop prices across Kenya<br>
      📈 Price predictions and trends<br>
      📍 Regional price comparisons<br>
      🏪 Best markets and selling strategies<br>
      <br>What pricing information would you like to know?`;
      this.suggestedQuestions = ['Show current prices', 'Price predictions', 'Market comparison'];
    }

    const botMessage: ChatMessage = {
      id: this.messages.length + 1,
      content: response,
      sender: 'bot',
      timestamp: new Date(),
      type: type
    };
    
    this.messages.push(botMessage);
  }

  formatMessage(content: string): string {
    return content;
  }

  formatTime(timestamp: Date): string {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  updateSuggestions() {
    if (this.focusOnPrices) {
      this.suggestedQuestions = [
        'Current maize prices',
        'Tomato price predictions',
        'Best markets to sell beans'
      ];
    }
  }

  scrollToBottom() {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        const chatBody = document.querySelector('.chat-body');
        if (chatBody) {
          chatBody.scrollTop = chatBody.scrollHeight;
        }
      }, 100);
    }
  }
}