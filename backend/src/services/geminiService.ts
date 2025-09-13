import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import type { ChatMessage } from '../types/index.js';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

export const generateChatResponse = async (
  userMessage: string,
  conversationHistory: ChatMessage[],
  context?: any
): Promise<string> => {
  try {
    // Get current price data for context
    const priceData = await getCurrentPriceContext();
    
    // Build system prompt with agricultural focus
    const systemPrompt = `You are AgriBot, an AI assistant specialized in Kenyan agricultural pricing and farming advice. 

CURRENT PRICE DATA:
${priceData}

GUIDELINES:
- Focus on agricultural pricing, market trends, and farming advice
- Provide accurate, helpful information about crop prices in Kenya
- Use current price data when available
- Be concise but informative
- Use Kenyan context (KSh currency, local regions, crops)
- If asked about non-agricultural topics, politely redirect to farming/pricing topics
- Always be encouraging and supportive to farmers

CONVERSATION HISTORY:
${conversationHistory.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

USER MESSAGE: ${userMessage}

Respond as AgriBot:`;

    const result = await model.generateContent(systemPrompt);
    const response = result.response;
    const text = response.text();

    logger.info('Gemini AI response generated successfully');
    return text;

  } catch (error: any) {
    logger.error('Failed to generate Gemini AI response:', error);
    
    // Fallback response
    return generateFallbackResponse(userMessage);
  }
};

const getCurrentPriceContext = async (): Promise<string> => {
  try {
    const result = await query(`
      SELECT c.name as crop_name, pe.price, r.name as region_name, pe.entry_date
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      WHERE pe.is_verified = true 
        AND pe.entry_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY pe.entry_date DESC, pe.price DESC
      LIMIT 20
    `);

    if (result.rows.length === 0) {
      return 'No recent price data available.';
    }

    const priceContext = result.rows.map(row => 
      `${row.crop_name}: KSh ${row.price}/kg in ${row.region_name} (${row.entry_date})`
    ).join('\n');

    return priceContext;
  } catch (error) {
    logger.error('Failed to get price context:', error);
    return 'Price data temporarily unavailable.';
  }
};

const generateFallbackResponse = (userMessage: string): string => {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
    return `I'd be happy to help with crop pricing information! However, I'm currently experiencing technical difficulties accessing the latest price data. 

For the most current prices, you can:
- Check the Public Portal on our website
- Subscribe to SMS alerts for daily updates
- Contact your local agricultural extension officer

Is there a specific crop or region you're interested in? I can try to provide general pricing guidance.`;
  }

  if (lowerMessage.includes('weather') || lowerMessage.includes('rain')) {
    return `Weather is crucial for farming success! While I don't have current weather data, I recommend:

- Check Kenya Meteorological Department forecasts
- Subscribe to weather alerts via SMS
- Plan your planting and harvesting around seasonal patterns
- Consider drought-resistant crops during dry seasons

What crops are you planning to grow? I can provide advice on weather-appropriate varieties.`;
  }

  if (lowerMessage.includes('farming') || lowerMessage.includes('crop')) {
    return `I'm here to help with your farming questions! I specialize in:

- Crop pricing and market trends
- Best times to plant and harvest
- Market opportunities
- Price predictions and analysis

What specific farming challenge can I help you with today?`;
  }

  return `Hello! I'm AgriBot, your agricultural pricing assistant. I'm here to help with:

🌾 Current crop prices across Kenya
📈 Price trends and predictions  
🏪 Best markets for selling
📱 SMS alerts for price updates

What would you like to know about agricultural pricing today?`;
};

export const analyzePriceTrends = async (cropId: string, regionId: string): Promise<string> => {
  try {
    const result = await query(`
      SELECT price, entry_date
      FROM price_entries
      WHERE crop_id = $1 AND region_id = $2 AND is_verified = true
      ORDER BY entry_date DESC
      LIMIT 30
    `, [cropId, regionId]);

    if (result.rows.length < 2) {
      return 'Insufficient data for trend analysis.';
    }

    const prices = result.rows.map(row => row.price);
    const latest = prices[0];
    const previous = prices[1];
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;

    const trend = latest > previous ? 'increasing' : latest < previous ? 'decreasing' : 'stable';
    const change = Math.abs(((latest - previous) / previous) * 100).toFixed(1);

    return `Price trend analysis:
- Current price: KSh ${latest}/kg
- Trend: ${trend} (${change}% change)
- 30-day average: KSh ${average.toFixed(2)}/kg
- Data points: ${prices.length} entries`;

  } catch (error) {
    logger.error('Failed to analyze price trends:', error);
    return 'Unable to analyze price trends at this time.';
  }
};