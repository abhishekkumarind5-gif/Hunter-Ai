/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class VideoStreamer {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isStreaming = false;

  constructor(private onFrame: (base64Data: string) => void) {
    this.videoElement = document.createElement("video");
    this.videoElement.setAttribute("autoplay", "");
    this.videoElement.setAttribute("playsinline", "");
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d") as any;
  }

  async start(facingMode: "user" | "environment" = "user") {
    try {
      // Stop existing stream if any
      this.stop();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: facingMode,
        },
      });
      if (this.videoElement) {
        this.videoElement.srcObject = this.mediaStream;
        await this.videoElement.play();
        this.isStreaming = true;
        this.streamFrames();
      }
      return this.mediaStream;
    } catch (err) {
      console.error("Error accessing camera:", err);
      throw err;
    }
  }

  private streamFrames = () => {
    if (!this.isStreaming || !this.videoElement || !this.canvas || !this.context) return;

    // Draw video frame to canvas
    this.canvas.width = this.videoElement.videoWidth;
    this.canvas.height = this.videoElement.videoHeight;
    this.context.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);

    // Convert to base64 JPEG
    const base64Data = this.canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    this.onFrame(base64Data);

    // Request next frame (approx 1-2 frames per second is usually enough for Gemini Live)
    // Actually, the skill says "inside a loop (e.g., requestAnimationFrame or setInterval)"
    // Let's use a timeout to limit the frame rate and save bandwidth/processing
    this.animationFrameId = window.setTimeout(this.streamFrames, 1000) as any;
  };

  stop() {
    this.isStreaming = false;
    if (this.animationFrameId) {
      clearTimeout(this.animationFrameId);
    }
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}
