import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface LandmarkInfo {
  name: string;
  history: string;
  narrative: string;
}

export async function analyzeLandmark(base64Image: string): Promise<LandmarkInfo> {
  // 1. Identify landmark using Pro model
  const identificationResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image.split(',')[1] || base64Image,
        },
      },
      {
        text: "Identify the landmark in this photo. Return only the name of the landmark.",
      },
    ],
  });

  const landmarkName = identificationResponse.text?.trim() || "Unknown Landmark";

  // 2. Fetch history and create narrative using Flash with Search Grounding
  const historyResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Tell me the history of ${landmarkName}. Provide a concise historical summary and then a separate short, engaging narrative script (about 3-4 sentences) that sounds like an AR tour guide.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          history: { type: Type.STRING },
          narrative: { type: Type.STRING },
        },
        required: ["history", "narrative"],
      },
    },
  });

  const data = JSON.parse(historyResponse.text || "{}");

  return {
    name: landmarkName,
    history: data.history || "History not available.",
    narrative: data.narrative || "Welcome to this historic site.",
  };
}

export async function generateNarration(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: `Narrate this in a warm, informative tour guide voice: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Charon' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");
  return base64Audio;
}
