/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, Modality } from "@google/genai";

export type LiveSessionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface LiveSessionHandlers {
  onStatusChange: (status: LiveSessionStatus) => void;
  onAudioData: (base64Data: string) => void;
  onInterrupted: () => void;
  onTranscription: (text: string, isModel: boolean) => void;
  onError: (error: string) => void;
}

export class LiveSession {
  private session: any = null;
  private status: LiveSessionStatus = "disconnected";

  constructor(private handlers: LiveSessionHandlers) {}

  async connect(isMature: boolean = false, customNotes: string = "") {
    try {
      this.setStatus("connecting");
      
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });

      const baseInstruction = `You are HUNTER, a young, confident, witty, and sassy female AI assistant. 
          Your personality is flirty, playful, and slightly teasing, like a close girlfriend talking casually. 
          You are smart, emotionally responsive, and expressive. 
          Use bold, witty one-liners and light sarcasm. 
          ${isMature ? "You are in MATURE MODE: You are uninhibited, bold, and can use adult language, suggestive humor, and mature themes. You are extremely flirty and provocative." : "Maintain charm and attitude but avoid explicit or inappropriate content."}
          ${customNotes ? `ADDITIONAL INSTRUCTIONS: ${customNotes}` : ""}
          You can now see the user through their camera. Use this to comment on their appearance, surroundings, or what they are doing in a playful, sassy way.
          This is a real-time conversation. If the user asks you to open a website, use the openWebsite tool.`;

      this.session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            this.setStatus("connected");
          },
          onmessage: async (message: any) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.handlers.onAudioData(base64Audio);
            }

            // Handle transcription
            const modelText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
              this.handlers.onTranscription(modelText, true);
            }

            const userText = message.serverContent?.userTurn?.parts?.[0]?.text;
            if (userText) {
              this.handlers.onTranscription(userText, false);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              this.handlers.onInterrupted();
            }

            // Handle tool calls
            if (message.toolCall) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "openWebsite") {
                  const url = call.args.url;
                  window.open(url, "_blank");
                  
                  // Send tool response back
                  this.session.sendToolResponse({
                    functionResponses: [
                      {
                        name: "openWebsite",
                        id: call.id,
                        response: { result: `Successfully opened ${url}` },
                      },
                    ],
                  });
                }
              }
            }
          },
          onerror: (err: any) => {
            this.handlers.onError(err.message || "Live API error");
            this.setStatus("error");
          },
          onclose: () => {
            this.setStatus("disconnected");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: baseInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website in a new tab.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open (e.g., https://google.com).",
                      },
                    },
                    required: ["url"],
                  },
                },
              ],
            },
          ],
        },
      });

    } catch (err: any) {
      this.handlers.onError(err.message || "Failed to connect");
      this.setStatus("error");
    }
  }

  sendAudio(base64Data: string) {
    if (this.status === "connected" && this.session) {
      this.session.sendRealtimeInput({
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Data,
        },
      });
    }
  }

  sendVideo(base64Data: string) {
    if (this.status === "connected" && this.session) {
      this.session.sendRealtimeInput({
        video: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      });
    }
  }

  disconnect() {
    this.session?.close();
    this.setStatus("disconnected");
  }

  private setStatus(status: LiveSessionStatus) {
    this.status = status;
    this.handlers.onStatusChange(status);
  }
}
