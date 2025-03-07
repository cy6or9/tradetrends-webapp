import { z } from "zod";

const mistralApiKey = import.meta.env.VITE_MISTRAL_API_KEY;

if (!mistralApiKey) {
  throw new Error("VITE_MISTRAL_API_KEY is required");
}

const analysisResponseSchema = z.object({
  analysis: z.string(),
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
});

export type StockAnalysis = z.infer<typeof analysisResponseSchema>;

export async function getStockAnalysis(symbol: string, news: string[]): Promise<StockAnalysis> {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mistralApiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages: [
        {
          role: "system",
          content: "You are a financial analyst. Analyze the following news articles about a stock and provide insights."
        },
        {
          role: "user",
          content: `Analyze these recent news articles about ${symbol}:\n\n${news.join("\n\n")}`
        }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to get AI analysis");
  }

  const data = await response.json();
  return analysisResponseSchema.parse(data);
}