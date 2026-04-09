/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Power, Globe, AlertCircle, Sparkles, Camera, CameraOff, RefreshCw, Settings, MessageSquare, History, Trash2, Key } from "lucide-react";
import { AudioStreamer } from "@/src/lib/audio-streamer";
import { VideoStreamer } from "@/src/lib/video-streamer";
import { LiveSession, LiveSessionStatus } from "@/src/lib/live-session";
import { StorageService, ChatMessage } from "@/src/lib/storage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [status, setStatus] = useState<LiveSessionStatus>("disconnected");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMature, setIsMature] = useState(false);
  const [customNotes, setCustomNotes] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const videoStreamerRef = useRef<VideoStreamer | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setNeedsKey(!hasKey);
      }
    };
    checkKey();
    setHistory(StorageService.getHistory());
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setNeedsKey(false);
      // After selecting key, we can try to connect
    }
  };

  const handleAudioData = useCallback((base64Data: string) => {
    if (audioStreamerRef.current) {
      audioStreamerRef.current.addPlaybackChunk(base64Data);
      setIsSpeaking(true);
      
      // Reset speaking state after a short delay if no more chunks arrive
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = setTimeout(() => {
        setIsSpeaking(false);
      }, 1000);
    }
  }, []);

  const handleInterrupted = useCallback(() => {
    if (audioStreamerRef.current) {
      audioStreamerRef.current.clearPlaybackQueue();
      setIsSpeaking(false);
    }
  }, []);

  const handleTranscription = useCallback((text: string, isModel: boolean) => {
    const newMessage = StorageService.saveMessage(text, isModel);
    setHistory(prev => [...prev, newMessage]);
  }, []);

  const clearHistory = () => {
    StorageService.clearHistory();
    setHistory([]);
  };

  const toggleCamera = async () => {
    if (isCameraOn) {
      videoStreamerRef.current?.stop();
      setIsCameraOn(false);
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    } else {
      try {
        if (!videoStreamerRef.current) {
          videoStreamerRef.current = new VideoStreamer((data) => {
            liveSessionRef.current?.sendVideo(data);
          });
        }
        const stream = await videoStreamerRef.current.start(facingMode);
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
        setIsCameraOn(true);
      } catch (err: any) {
        setError("Failed to access camera: " + err.message);
      }
    }
  };

  const switchCamera = async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    if (isCameraOn) {
      try {
        const stream = await videoStreamerRef.current?.start(newMode);
        if (videoPreviewRef.current && stream) videoPreviewRef.current.srcObject = stream;
      } catch (err: any) {
        setError("Failed to switch camera: " + err.message);
      }
    }
  };

  const toggleSession = async () => {
    if (status === "connected" || status === "connecting") {
      liveSessionRef.current?.disconnect();
      audioStreamerRef.current?.stop();
      videoStreamerRef.current?.stop();
      setIsCameraOn(false);
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
      setStatus("disconnected");
    } else {
      setError(null);
      try {
        if (!audioStreamerRef.current) {
          audioStreamerRef.current = new AudioStreamer((data) => {
            liveSessionRef.current?.sendAudio(data);
          });
        }
        
        if (!liveSessionRef.current) {
          liveSessionRef.current = new LiveSession({
            onStatusChange: setStatus,
            onAudioData: handleAudioData,
            onInterrupted: handleInterrupted,
            onTranscription: handleTranscription,
            onError: (err) => {
              setError(err);
              if (err.includes("Requested entity was not found")) {
                setNeedsKey(true);
              }
            },
          });
        }

        await audioStreamerRef.current.start();
        await liveSessionRef.current.connect(isMature, customNotes);
      } catch (err: any) {
        setError(err.message || "Failed to start session");
        setStatus("error");
      }
    }
  };

  useEffect(() => {
    return () => {
      liveSessionRef.current?.disconnect();
      audioStreamerRef.current?.stop();
      videoStreamerRef.current?.stop();
    };
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case "connected": return "bg-emerald-500";
      case "connecting": return "bg-amber-500";
      case "error": return "bg-rose-500";
      default: return "bg-slate-500";
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 overflow-hidden font-sans">
      {/* Futuristic Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${isMature ? "bg-rose-900/30" : "bg-purple-900/20"} rounded-full blur-[120px] transition-colors duration-1000`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${isMature ? "bg-red-900/20" : "bg-blue-900/20"} rounded-full blur-[120px] transition-colors duration-1000`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
      </div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-8 left-0 right-0 flex justify-between items-center px-8"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${isMature ? "from-rose-600 to-red-800" : "from-purple-600 to-blue-600"} flex items-center justify-center shadow-lg transition-all duration-500`}>
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">HUNTER <span className={isMature ? "text-rose-400" : "text-purple-400"}>AI</span></h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{status}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSelectKey}
            className="rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
            title="Change API Key"
          >
            <Key className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowHistory(!showHistory)}
            className={`rounded-full ${showHistory ? "bg-slate-800 text-white" : "text-slate-400"}`}
          >
            <History className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowSettings(!showSettings)}
            className={`rounded-full ${showSettings ? "bg-slate-800 text-white" : "text-slate-400"}`}
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </motion.div>

      {/* History Panel */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            className="absolute left-0 top-0 bottom-0 w-80 bg-[#0a0a0a]/95 backdrop-blur-xl border-r border-slate-800 z-50 p-6 flex flex-col gap-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                Local History
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>Close</Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-xs">No local records found</p>
                </div>
              ) : (
                history.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.isModel ? "items-start" : "items-end"}`}>
                    <div className={`max-w-[90%] p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.isModel 
                        ? "bg-slate-800/50 text-slate-200 rounded-tl-none" 
                        : "bg-purple-600/20 text-purple-200 border border-purple-500/20 rounded-tr-none"
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-800">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearHistory}
                className="w-full text-rose-500 hover:bg-rose-500/10 gap-2 text-[10px] uppercase tracking-widest font-bold"
              >
                <Trash2 className="w-3 h-3" />
                Clear Local Storage
              </Button>
              <p className="text-[8px] text-slate-600 text-center mt-3 uppercase tracking-tighter">
                Data is stored only on this device
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="absolute right-0 top-0 bottom-0 w-80 bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-slate-800 z-50 p-6 flex flex-col gap-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-400" />
                Configuration
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>Close</Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Mature Mode (18+)</label>
                  <Button
                    size="sm"
                    variant={isMature ? "destructive" : "outline"}
                    onClick={() => setIsMature(!isMature)}
                    className="h-7 text-[10px] px-3"
                  >
                    {isMature ? "ENABLED" : "DISABLED"}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Enables adult language, suggestive humor, and provocative behavior. Use with caution.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <MessageSquare className="w-3 h-3" />
                  Behavior Notes
                </label>
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="e.g. Be extra mean today, or talk about specific topics..."
                  className="w-full h-32 bg-slate-900/50 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  These notes will influence HUNTER's personality and knowledge for the next session.
                </p>
              </div>
            </div>

            <div className="mt-auto">
              <Badge variant="outline" className="w-full justify-center py-2 border-slate-800 text-slate-500 text-[10px]">
                Settings apply on next connection
              </Badge>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Visualizer Area */}
      <div className="relative flex items-center justify-center w-full max-w-md aspect-square">
        {/* Video Preview */}
        <AnimatePresence>
          {isCameraOn && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 z-0 overflow-hidden rounded-full border-2 border-purple-500/30"
            >
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isMature ? "opacity-90 contrast-125 saturate-150" : "opacity-80"}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Outer Rings */}
        <AnimatePresence>
          {status === "connected" && (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ 
                  scale: isSpeaking ? [1, 1.1, 1] : 1,
                  opacity: 1,
                  rotate: 360 
                }}
                transition={{ 
                  rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                  scale: { duration: 0.5, repeat: isSpeaking ? Infinity : 0 }
                }}
                className="absolute inset-0 border border-purple-500/20 rounded-full"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ 
                  scale: isSpeaking ? [1, 1.05, 1] : 1,
                  opacity: 1,
                  rotate: -360 
                }}
                transition={{ 
                  rotate: { duration: 15, repeat: Infinity, ease: "linear" },
                  scale: { duration: 0.4, repeat: isSpeaking ? Infinity : 0 }
                }}
                className="absolute inset-4 border border-blue-500/20 rounded-full border-dashed"
              />
            </>
          )}
        </AnimatePresence>

        {/* Central Button */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative z-10"
        >
          <Button
            onClick={toggleSession}
            variant="ghost"
            className={`w-48 h-48 rounded-full p-0 flex flex-col items-center justify-center transition-all duration-500 border-2 ${
              status === "connected" 
                ? (isMature ? "bg-rose-600/10 border-rose-500/50 shadow-[0_0_50px_rgba(244,63,94,0.3)]" : "bg-purple-600/10 border-purple-500/50 shadow-[0_0_50px_rgba(168,85,247,0.3)]")
                : "bg-slate-900/50 border-slate-700/50"
            }`}
          >
            <div className={`mb-2 transition-transform duration-500 ${status === "connected" ? "scale-110" : ""}`}>
              {status === "connected" ? (
                <Mic className={`w-12 h-12 ${isMature ? "text-rose-400" : "text-purple-400"}`} />
              ) : status === "connecting" ? (
                <div className={`w-12 h-12 border-4 border-slate-700 ${isMature ? "border-t-rose-500" : "border-t-purple-500"} rounded-full animate-spin`} />
              ) : (
                <Power className="w-12 h-12 text-slate-500" />
              )}
            </div>
            <span className={`text-xs font-bold uppercase tracking-widest ${status === "connected" ? (isMature ? "text-rose-400" : "text-purple-400") : "text-slate-500"}`}>
              {status === "connected" ? "Listening" : status === "connecting" ? "Connecting" : "Power On"}
            </span>
          </Button>

          {/* Recent Chat Preview Overlay */}
          <AnimatePresence>
            {status === "connected" && history.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-64 pointer-events-none"
              >
                <div className="space-y-2">
                  {history.slice(-2).map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-2 rounded-lg text-[10px] leading-tight backdrop-blur-md border ${
                        msg.isModel 
                          ? "bg-slate-900/60 border-slate-700/50 text-slate-300" 
                          : "bg-purple-900/40 border-purple-500/30 text-purple-200"
                      }`}
                    >
                      <span className="font-bold mr-1">{msg.isModel ? "HUNTER:" : "YOU:"}</span>
                      {msg.text.length > 60 ? msg.text.substring(0, 60) + "..." : msg.text}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Camera Toggle Button */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute -right-16 top-1/2 -translate-y-1/2"
          >
            <Button
              onClick={toggleCamera}
              variant="outline"
              size="icon"
              className={`w-12 h-12 rounded-full border-slate-700/50 transition-all duration-300 ${
                isCameraOn ? "bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]" : "bg-slate-900/50 text-slate-500"
              }`}
            >
              {isCameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </Button>
          </motion.div>

          {/* Camera Switch Button */}
          <AnimatePresence>
            {isCameraOn && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="absolute -left-16 top-1/2 -translate-y-1/2"
              >
                <Button
                  onClick={switchCamera}
                  variant="outline"
                  size="icon"
                  className="w-12 h-12 rounded-full border-slate-700/50 bg-slate-900/50 text-slate-400 hover:text-white"
                >
                  <RefreshCw className="w-5 h-5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Waveform Animation when Speaking */}
          <AnimatePresence>
            {isSpeaking && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -bottom-12 left-0 right-0 flex justify-center gap-1 h-8"
              >
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: [8, 24, 8] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                    className="w-1 bg-purple-500 rounded-full"
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Info Cards */}
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-12 w-full max-w-md space-y-4"
      >
        {needsKey && (
          <Card className="bg-amber-500/10 border-amber-500/20 p-4 flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-bold uppercase tracking-wider">API Key Required</p>
            </div>
            <p className="text-xs text-amber-200/70">
              This model requires a paid API key. Please select one to continue.
            </p>
            <Button 
              onClick={handleSelectKey}
              variant="outline" 
              className="w-full border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            >
              Select API Key
            </Button>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-amber-500/50 underline hover:text-amber-500"
            >
              Learn about billing
            </a>
          </Card>
        )}

        {error && (
          <Card className="bg-rose-500/10 border-rose-500/20 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-200">{error}</p>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-slate-900/40 border-slate-800/50 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Capabilities</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Real-time voice & vision interaction. Zoya can see you!
            </p>
          </Card>
          <Card className="bg-slate-900/40 border-slate-800/50 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Persona</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isMature ? "Uninhibited, bold, and provocative. 18+ mode active." : "Witty, sassy, and flirty. HUNTER has attitude."}
            </p>
          </Card>
        </div>

        <div className="text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-medium">
            Powered by Gemini Multimodal Live
          </p>
        </div>
      </motion.div>

      {/* Footer Controls */}
      <div className="absolute bottom-8 flex gap-4">
        <Badge variant="outline" className="bg-slate-900/50 border-slate-800 text-slate-400 px-3 py-1">
          16kHz PCM
        </Badge>
        <Badge variant="outline" className="bg-slate-900/50 border-slate-800 text-slate-400 px-3 py-1">
          24kHz Output
        </Badge>
      </div>
    </div>
  );
}
