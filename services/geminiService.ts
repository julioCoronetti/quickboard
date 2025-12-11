import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeDrawing = async (base64Image: string): Promise<string> => {
  try {
    const ai = getClient();
    // Remove header from base64 string if present (data:image/png;base64,...)
    const cleanBase64 = base64Image.split(',')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64
            }
          },
          {
            text: "Analise este desenho de lousa. O que está desenhado? Se houver texto, transcreva-o. Se for um problema matemático, resolva-o. Responda em Português do Brasil de forma concisa."
          }
        ]
      }
    });

    return response.text || "Não consegui analisar o desenho.";
  } catch (error) {
    console.error("Error analyzing drawing:", error);
    return "Erro ao conectar com a IA. Verifique sua chave de API.";
  }
};
