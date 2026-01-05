/**
 * Claude API client for shopping list generation
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 2048;

/**
 * Generate shopping list from pattern data using Claude
 */
export async function generateShoppingList(patternSummary, options = {}) {
  const { daysCoverage = 7 } = options;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in environment');
  }

  if (!patternSummary || (!patternSummary.regularItems && !patternSummary.infrequentItems)) {
    throw new Error('No pattern data provided for shopping list generation');
  }

  const prompt = buildShoppingListPrompt(patternSummary, daysCoverage);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0].text;
    const recommendations = parseRecommendations(content);

    return {
      recommendations,
      usage: response.usage
    };
  } catch (error) {
    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    if (error.status === 401) {
      throw new Error('Invalid API key. Please check your ANTHROPIC_API_KEY.');
    }
    throw error;
  }
}

/**
 * Build the prompt for Claude to generate shopping list
 */
function buildShoppingListPrompt(patternSummary, daysCoverage) {
  return `You are a shopping pattern analyst. Based on the purchase history below, suggest items the user likely needs for the next ${daysCoverage} days.

Purchase Patterns:
${JSON.stringify(patternSummary, null, 2)}

Return a JSON object with this exact structure:
{
  "recommendations": [
    {
      "item": "item name",
      "quantity": number,
      "classification": "regular" | "infrequent",
      "reason": "brief explanation",
      "confidence": 0.0-1.0
    }
  ]
}

Focus on:
1. Items with regular purchase patterns that are due or overdue
2. Infrequent items if enough time has passed since last purchase
3. Realistic quantities based on typical consumption and ${daysCoverage}-day coverage
4. Exclude obvious one-off purchases (birthday cakes, special occasion items, etc.)
5. Higher confidence for items with consistent purchase patterns

Return ONLY the JSON object, no additional text.`;
}

/**
 * Parse Claude's response to extract recommendations
 */
function parseRecommendations(content) {
  try {
    // Try to extract JSON from response
    // Claude might return markdown code blocks
    let jsonStr = content;

    // Remove markdown code blocks if present
    if (content.includes('```json')) {
      const match = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonStr = match[1];
      }
    } else if (content.includes('```')) {
      const match = content.match(/```\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonStr = match[1];
      }
    }

    const parsed = JSON.parse(jsonStr.trim());

    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      throw new Error('Invalid response format: missing recommendations array');
    }

    // Validate each recommendation
    for (const rec of parsed.recommendations) {
      if (!rec.item || typeof rec.item !== 'string') {
        throw new Error('Invalid recommendation: missing or invalid item name');
      }
      if (typeof rec.quantity !== 'number' || rec.quantity < 1) {
        throw new Error(`Invalid recommendation for ${rec.item}: invalid quantity`);
      }
      if (!['regular', 'infrequent'].includes(rec.classification)) {
        throw new Error(`Invalid recommendation for ${rec.item}: invalid classification`);
      }
      if (typeof rec.confidence !== 'number' || rec.confidence < 0 || rec.confidence > 1) {
        throw new Error(`Invalid recommendation for ${rec.item}: invalid confidence`);
      }
    }

    return parsed.recommendations;
  } catch (error) {
    console.error('Failed to parse Claude response:', content);
    throw new Error(`Failed to parse shopping list recommendations: ${error.message}`);
  }
}

/**
 * Test the Claude API connection
 */
export async function testConnection() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in environment');
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Say "OK" if you can read this.'
        }
      ]
    });

    return {
      success: true,
      model: MODEL,
      response: response.content[0].text
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
