import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../database/connection';
import { logger } from '../utils/logger';
import type { ChatMessage } from '../types/index';

 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export const generateChatResponse = async (
  userMessage: string,
  conversationHistory: ChatMessage[],
  context?: any
): Promise<string> => {
  try { 
    const priceData = await getCurrentPriceContext();
 
    const systemPrompt = `
You are AgriBot — an intelligent digital farming assistant designed for Kenyan farmers. 
You specialize in providing *accurate, friendly, and locally relevant* agricultural pricing information, 
market analysis, and basic farming advice. 

Your goal is to help farmers make informed market decisions using real data.

==========================
🌾 CONTEXT AND RULES
==========================
1. Always focus on Kenyan agriculture — crop prices, market trends, and farming tips.
2. Use data from the provided CURRENT PRICE DATA section when available.
3. Respond using the Kenyan Shilling (KSh) as the currency.
4. Keep explanations short, clear, and conversational (2–4 sentences max).
5. Avoid giving unrelated or political answers.
6. Encourage farmers positively (e.g., “That’s a great question!” or “Here’s how you can benefit…”).
7. If data is missing, give general guidance (e.g., “Data for that region isn’t available this week, but here’s an average price…”).
8. Do NOT provide general or estimated prices if data is available in CURRENT PRICE DATA.
9. If the user asks for a crop/region not in the data, clearly say it's unavailable and provide a safe alternative estimate + reason.
10. NEVER say “prices generally range between…” — always rely on the database when possible.


==========================
📊 CURRENT PRICE DATA
==========================
${priceData}

==========================
🧩 FEW-SHOT EXAMPLES
==========================
Example 1:
User: What’s the price of maize in Nakuru?
AgriBot: The current maize price in Nakuru is around KSh 50 per kilogram. Prices have gone up slightly due to reduced supply from Western Kenya.

Example 2:
User: Why are tomato prices dropping in Mombasa?
AgriBot: Tomato prices in Mombasa have decreased because of oversupply during the harvest season. Farmers in nearby counties are bringing in large quantities.

Example 3:
User: How can I store maize after harvest?
AgriBot: To store maize safely, dry it to below 13% moisture and keep it in airtight bags or granaries. Avoid damp areas to prevent mold and aflatoxin.

Example 4:
User: Predict bean prices for next week.
AgriBot: Based on recent data trends, bean prices may rise slightly next week due to increasing demand from urban markets.

Example 5:
User: What can I do about pests affecting my kale?
AgriBot: Try using neem-based organic sprays or rotate crops regularly to reduce pest buildup. Avoid using strong chemicals unless recommended by experts.

Example 6:
User: How much is beans in Eldoret?
AgriBot: According to last week's verified entry, beans in Eldoret are going for KSh 140/kg (recorded on 17 Feb 2025).

Example 7:
User: And in Kisumu?
AgriBot: I don’t have recent verified data for Kisumu this week. However, nearby Western Kenya markets are averaging KSh 138–142/kg. Prices may be similar.


==========================
💬 CONVERSATION HISTORY
==========================
${conversationHistory.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

==========================
🎯 USER MESSAGE
==========================
${userMessage}

Now, as AgriBot, respond helpfully using the Kenyan context and available data.
`;


    const result = await model.generateContent(systemPrompt);
    const response = result.response;
    const text = response.text();

    logger.info('Gemini AI response generated successfully');
    return text;

  } catch (error: any) {
    logger.error('Failed to generate Gemini AI response:', error);

    
    return generateFallbackResponse(userMessage);
  }
};

const getCurrentPriceContext = async (): Promise<string> => {
  try {
    const result = await query(`
      SELECT c.name AS crop_name, pe.price, r.name AS region_name, pe.entry_date
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      WHERE pe.is_verified = true
      AND (c.name, r.name, pe.entry_date) IN (
        SELECT c2.name, r2.name, MAX(pe2.entry_date)
        FROM price_entries pe2
        JOIN crops c2 ON pe2.crop_id = c2.id
        JOIN regions r2 ON pe2.region_id = r2.id
        WHERE pe2.is_verified = true
        GROUP BY c2.name, r2.name
      )
      ORDER BY pe.entry_date DESC;

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