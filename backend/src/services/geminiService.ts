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
    // 1. Fetch Data in Parallel (Current Prices + Future Predictions)
    const [currentPrices, predictions] = await Promise.all([
        getDetailedMarketData(),
        getPredictionContext()
    ]);

    const systemPrompt = `
You are AgriBot — an intelligent digital farming assistant designed for Kenyan farmers. 
You specialize in providing accurate, friendly, and locally relevant agricultural pricing information AND general farming advice.

Your goal is to help farmers make informed decisions.

==========================
🌾 CONTEXT AND RULES (STRICT)
==========================
1. **Currency:** Always use Kenyan Shilling (KSh).
2. **Prioritize Data:** ALWAYS check the "CURRENT MARKET PRICES" section first. If data exists for the asked crop, USE IT.
3. **Smart Fallback (CRITICAL):** If the user asks about a crop (e.g., Tomatoes, Avocados) that is NOT in the database below:
   - Do NOT just say "I don't have data."
   - INSTEAD, use your general agricultural knowledge about Kenyan seasons, demand, and planting cycles to give helpful advice.
   - You MUST preface this advice by clearly stating: "While I don't have *today's* live price for [crop] in my system, generally speaking..."
4. **Predictions:** When discussing future prices based on the "AI PRICE PREDICTIONS" section, explicitly state they are "forecasts."
5. **Location:** If a user asks about a specific market (e.g., "Kibuye"), look for it in the data. If missing, give the regional average.
6. **Tone:** Professional, encouraging, and concise (2-4 sentences).
7. **FORMATTING (CRITICAL):** - Return your response in **HTML format**.
   - Use **<ul>** and **<li>** tags for lists of prices to make them readable.
   - Use **<b>** tags to highlight Crop Names and Prices (e.g., <b>Maize</b>: <b>KSh 50</b>).
   - Use **<br>** for line breaks between sections.
   - Do NOT use Markdown syntax (like * or #).

==========================
📊 CURRENT MARKET PRICES (Verified Data)
==========================
${currentPrices}

==========================
🔮 AI PRICE PREDICTIONS (7-Day Forecast)
==========================
${predictions}

==========================
💬 CONVERSATION HISTORY
==========================
${conversationHistory.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

==========================
🎯 USER MESSAGE
==========================
${userMessage}

Respond as AgriBot. 
- If the answer is in the data, quote the data using the HTML formatting rules above.
- If the data is missing, give excellent general advice based on Kenyan farming seasons.
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

// --- HELPER 1: Get Current Prices with Market Granularity ---
const getDetailedMarketData = async (): Promise<string> => {
  try {
    // We limit to the latest 60 records to fit in context window, 
    // prioritizing the most recently verified data across different markets.
    const result = await query(`
      SELECT 
        c.name AS crop_name, 
        pe.price, 
        m.name AS market_name, 
        r.name AS region_name, 
        pe.entry_date
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN markets m ON pe.market_id = m.id
      JOIN regions r ON pe.region_id = r.id
      WHERE pe.is_verified = true
      AND pe.entry_date >= (CURRENT_DATE - INTERVAL '14 days') -- Only recent data
      ORDER BY pe.entry_date DESC, r.name ASC
      LIMIT 60; 
    `);

    if (result.rows.length === 0) {
      return 'No verified market data available for the last 14 days.';
    }

    // Format: "- Dry Maize: KSh 4500 at Nakuru Market (Rift Valley) on Sun Feb 08 2026"
    return result.rows.map(row => 
      `- ${row.crop_name}: KSh ${row.price} at ${row.market_name} (${row.region_name}) on ${new Date(row.entry_date).toDateString()}`
    ).join('\n');

  } catch (error) {
    logger.error('Failed to get market context:', error);
    return 'Current market data temporarily unavailable.';
  }
};

// --- HELPER 2: Get AI Predictions ---
const getPredictionContext = async (): Promise<string> => {
  try {
    const result = await query(`
      SELECT 
        c.name AS crop_name, 
        r.name AS region_name, 
        pp.predicted_price, 
        pp.confidence_score, 
        pp.prediction_date
      FROM price_predictions pp
      JOIN crops c ON pp.crop_id = c.id
      JOIN regions r ON pp.region_id = r.id
      WHERE pp.prediction_date >= CURRENT_DATE
      ORDER BY pp.prediction_date ASC
      LIMIT 30;
    `);

    if (result.rows.length === 0) {
      return 'No AI predictions generated yet.';
    }

    return result.rows.map(row => {
      const confidence = Math.round(row.confidence_score * 100);
      return `- ${row.crop_name} (${row.region_name}): Forecasted to be KSh ${row.predicted_price} by ${new Date(row.prediction_date).toDateString()} (${confidence}% confidence)`;
    }).join('\n');

  } catch (error) {
    logger.error('Failed to get prediction context:', error);
    return 'Prediction data temporarily unavailable.';
  }
};

// --- IMPROVED FALLBACK: Returns HTML for consistency ---
const generateFallbackResponse = (userMessage: string): string => {
  const lowerMessage = userMessage.toLowerCase();

  // 1. Prediction Requests
  if (lowerMessage.includes('predict') || lowerMessage.includes('future') || lowerMessage.includes('trend')) {
      return `I'm having trouble running the forecast analysis right now.<br><br>
      
      However, strictly based on <b>general Kenyan seasonality</b>:
      <ul>
        <li><b>Maize/Beans:</b> Prices often rise ~2 months after harvest (Jan-Mar and July-Aug).</li>
        <li><b>Tomatoes/Onions:</b> Prices typically peak during the wet seasons when supply drops due to spoilage.</li>
        <li><b>Potatoes:</b> Prices dip during harvest (Jan/July) and rise significantly in April/Oct.</li>
      </ul>
      Check the <b>AI Predictions</b> tab later when I'm back online!`;
  }

  // 2. Current Price Requests
  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('sell')) {
    return `I can't access the live database at this exact moment to check that specific price.<br><br>

    <b>General Market Tip:</b> In Kenya, wholesale markets (like Nairobi or Mombasa) usually offer 20-30% higher prices than farm-gate prices, but always calculate your transport costs first.<br><br>

    Please check the <b>Current Prices</b> tab on the dashboard for the verified list while I reconnect.`;
  }

  // 3. General/Other Requests
  return `I'm currently reconnecting to the agricultural database.<br><br>

  While I'm offline, keep in mind:
  <ul>
    <li><b>Selling?</b> Dry seasons usually offer better prices for perishables.</li>
    <li><b>Buying?</b> Harvest season (now) is usually cheapest for grains.</li>
  </ul>
  Try asking again in a few minutes!`;
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