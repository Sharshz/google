import React, { useState, useRef, useEffect } from 'react';
import { auth, db, googleProvider } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocFromServer, doc } from 'firebase/firestore';
import { Camera, History, LogOut, MapPin, Sparkles, Volume2, Loader2, Image as ImageIcon, Trash2, X, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeLandmark, generateNarration, LandmarkInfo } from './lib/gemini';
import { cn } from './lib/utils';

// --- Types ---
interface TravelLog {
  id: string;
  userId: string;
  imageUrl: string;
  landmarkName: string;
  history: string;
  narrative: string;
  keyFacts: string[];
  timestamp: any;
}

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [logs, setLogs] = useState<TravelLog[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentResult, setCurrentResult] = useState<LandmarkInfo | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [audioVolume, setAudioVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Volume Sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioVolume;
    }
  }, [audioVolume]);

  // Fetch Logs
  useEffect(() => {
    if (!user) {
      setLogs([]);
      return;
    }

    const q = query(
      collection(db, 'travelLogs'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TravelLog[];
      setLogs(newLogs);
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const handleSignOut = () => signOut(auth);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setCurrentImage(base64);
      await processImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64: string) => {
    if (!user) return;
    setIsAnalyzing(true);
    setCurrentResult(null);
    
    try {
      const result = await analyzeLandmark(base64);
      setCurrentResult(result);
      
      // Save to Firestore
      await addDoc(collection(db, 'travelLogs'), {
        userId: user.uid,
        imageUrl: base64,
        landmarkName: result.name,
        history: result.history,
        narrative: result.narrative,
        keyFacts: result.keyFacts,
        timestamp: serverTimestamp()
      });

      // Auto-play narration
      handlePlayNarration(result.narrative);
    } catch (error) {
      console.error("Analysis error:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePlayNarration = async (text: string) => {
    if (audioRef.current && audioRef.current.src && isAudioPlaying) {
      if (isAudioPaused) {
        audioRef.current.play();
        setIsAudioPaused(false);
      } else {
        audioRef.current.pause();
        setIsAudioPaused(true);
      }
      return;
    }

    try {
      setIsAudioPlaying(true);
      setIsAudioPaused(false);
      const base64Audio = await generateNarration(text);
      const audioBlob = b64toBlob(base64Audio, 'audio/wav');
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.volume = audioVolume;
        audioRef.current.play();
      }
    } catch (error) {
      console.error("Audio error:", error);
      setIsAudioPlaying(false);
    }
  };

  const b64toBlob = (b64Data: string, contentType = '', sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-white font-sans selection:bg-accent/30 overflow-x-hidden">
      {/* Viewfinder Background (Fixed) */}
      <div className="fixed inset-0 viewfinder-grid opacity-40 pointer-events-none" />

      {/* Header */}
      <header className="relative z-20 border-b border-glass-border glass-panel">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-2xl shadow-accent/40">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">GeoLens AI</h1>
              <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em]">Tourism OS v1.0</span>
            </div>
          </div>
          
          {user ? (
            <div className="flex items-center gap-6">
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_#10b981]" />
                  <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">System Active</span>
                </div>
                <span className="text-sm font-medium">{user.displayName}</span>
              </div>
              <button 
                onClick={handleSignOut}
                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-glass-border transition-all"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5 text-text-dim" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleSignIn}
              className="px-6 py-2.5 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent/80 transition-all shadow-lg shadow-accent/20"
            >
              Initialize System
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold uppercase tracking-widest mb-8">
                <Sparkles className="w-3.5 h-3.5" />
                Next-Gen Recognition
              </div>
              <h2 className="text-6xl font-bold mb-8 leading-[1.1] tracking-tight">Discover the World Through AI.</h2>
              <p className="text-text-dim mb-12 text-xl leading-relaxed">
                A high-precision scanning interface for identifying landmarks and unlocking historical data in real-time.
              </p>
              <button 
                onClick={handleSignIn}
                className="group flex items-center gap-4 px-10 py-5 bg-accent text-white font-bold rounded-2xl hover:scale-105 transition-all shadow-2xl shadow-accent/30"
              >
                Access Interface
                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Left Column: Scanner & Result */}
            <div className="lg:col-span-7 space-y-8">
              {/* Scanner Viewfinder */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-accent/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative glass-panel rounded-[32px] p-2 overflow-hidden">
                  <div 
                    className="relative aspect-[4/3] rounded-[24px] overflow-hidden cursor-pointer bg-black/40 flex flex-col items-center justify-center group"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {/* Scan Corners */}
                    <div className="scan-corner top-8 left-8 border-r-0 border-b-0" />
                    <div className="scan-corner top-8 right-8 border-l-0 border-b-0" />
                    <div className="scan-corner bottom-8 left-8 border-r-0 border-t-0" />
                    <div className="scan-corner bottom-8 right-8 border-l-0 border-t-0" />
                    
                    {/* Scan Line Animation */}
                    <motion.div 
                      animate={{ top: ["10%", "90%", "10%"] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 w-full h-0.5 bg-accent shadow-[0_0_15px_#3b82f6] z-10 opacity-50"
                    />

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileSelect} 
                      accept="image/*" 
                      className="hidden" 
                    />

                    {currentImage ? (
                      <>
                        <img 
                          src={currentImage} 
                          alt="Captured" 
                          className="w-full h-full object-cover opacity-70"
                          referrerPolicy="no-referrer"
                        />
                        {/* AR Overlay */}
                        {currentResult && !isAnalyzing && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 z-20 p-8 flex flex-col justify-end"
                          >
                            <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-accent px-4 py-1 rounded-md text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                              Target Identified: {currentResult.name}
                            </div>
                            
                            <div className="space-y-3 max-w-xs">
                              {currentResult.keyFacts?.map((fact, i) => (
                                <motion.div 
                                  key={i}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  className="flex items-center gap-3 bg-black/60 backdrop-blur-md border border-accent/30 p-3 rounded-xl"
                                >
                                  <div className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_#3b82f6]" />
                                  <span className="text-xs font-bold tracking-wide">{fact}</span>
                                </motion.div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center text-center px-6">
                        <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border border-accent/20">
                          <Camera className="w-10 h-10 text-accent" />
                        </div>
                        <h3 className="text-2xl font-bold mb-3">Initialize Scanner</h3>
                        <p className="text-text-dim text-sm max-w-xs">Position landmark within frame and click to capture data</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Result Information */}
              <AnimatePresence mode="wait">
                {isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="glass-panel rounded-[32px] p-16 flex flex-col items-center justify-center gap-6"
                  >
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
                      <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-accent animate-pulse" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-2xl font-bold mb-2">Analyzing Visual Data</h3>
                      <p className="text-text-dim text-sm tracking-widest uppercase font-bold">Cross-referencing global landmarks...</p>
                    </div>
                  </motion.div>
                )}

                {currentResult && !isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-[32px] overflow-hidden"
                  >
                    <div className="p-10 space-y-10">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="px-3 py-1 bg-accent/20 border border-accent/30 rounded-md text-[10px] font-black text-accent uppercase tracking-[0.2em]">
                              Identified
                            </div>
                            <div className="text-[10px] text-text-dim font-bold uppercase tracking-widest">
                              Confidence: 99.8%
                            </div>
                          </div>
                          <h2 className="text-5xl font-bold tracking-tight">{currentResult.name}</h2>
                        </div>
                        
                        <div className="flex flex-col gap-4 min-w-[240px]">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handlePlayNarration(currentResult.narrative)}
                              className={cn(
                                "group flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-bold transition-all shadow-xl flex-1",
                                isAudioPlaying 
                                  ? (isAudioPaused ? "bg-white text-black" : "bg-accent text-white animate-pulse")
                                  : "bg-white text-black hover:bg-accent hover:text-white"
                              )}
                            >
                              {isAudioPlaying ? (
                                isAudioPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />
                              ) : (
                                <Volume2 className="w-5 h-5" />
                              )}
                              {isAudioPlaying ? (isAudioPaused ? "Resume" : "Pause") : "Start AR Tour"}
                            </button>

                            {isAudioPlaying && (
                              <button 
                                onClick={() => {
                                  if (audioRef.current) {
                                    audioRef.current.pause();
                                    audioRef.current.currentTime = 0;
                                    setIsAudioPlaying(false);
                                    setIsAudioPaused(false);
                                  }
                                }}
                                className="p-3.5 bg-white/5 hover:bg-white/10 rounded-2xl border border-glass-border text-text-dim transition-all"
                                title="Stop Narration"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            )}
                          </div>

                          {isAudioPlaying && (
                            <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-glass-border">
                              <Volume2 className="w-4 h-4 text-text-dim" />
                              <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.01" 
                                value={audioVolume}
                                onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Historical Summary</h4>
                          <p className="text-text-dim leading-relaxed text-lg">
                            {currentResult.history}
                          </p>
                        </div>
                        <div className="space-y-6">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Site Intelligence</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 p-5 rounded-2xl border border-glass-border">
                              <span className="block text-2xl font-bold mb-1">Active</span>
                              <span className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Status</span>
                            </div>
                            <div className="bg-white/5 p-5 rounded-2xl border border-glass-border">
                              <span className="block text-2xl font-bold mb-1">Verified</span>
                              <span className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Source</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: Travel Log */}
            <div className="lg:col-span-5">
              <div className="sticky top-28 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-lg border border-glass-border">
                      <History className="w-5 h-5 text-accent" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">Mission Log</h3>
                  </div>
                  <div className="px-3 py-1 glass-panel rounded-full text-[10px] font-bold text-text-dim uppercase tracking-widest">
                    {logs.length} Records
                  </div>
                </div>

                <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-3 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="text-center py-20 glass-panel rounded-[32px] border-dashed">
                      <ImageIcon className="w-10 h-10 text-white/10 mx-auto mb-4" />
                      <p className="text-sm text-text-dim font-medium">No visual data recorded.<br/>Initialize scanner to begin.</p>
                    </div>
                  ) : (
                    logs.map((log) => (
                      <motion.div 
                        key={log.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="group relative glass-panel rounded-2xl p-4 flex gap-5 hover:bg-white/10 transition-all cursor-pointer border-transparent hover:border-accent/30"
                        onClick={() => {
                          setCurrentResult({
                            name: log.landmarkName,
                            history: log.history,
                            narrative: log.narrative,
                            keyFacts: log.keyFacts || []
                          });
                          setCurrentImage(log.imageUrl);
                        }}
                      >
                        <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-black/40 border border-glass-border">
                          <img 
                            src={log.imageUrl} 
                            alt={log.landmarkName} 
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all group-hover:scale-110"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-center gap-2 mb-1">
                            <MapPin className="w-3 h-3 text-accent" />
                            <span className="text-[10px] text-accent font-bold uppercase tracking-widest">Location Log</span>
                          </div>
                          <h4 className="font-bold text-lg truncate group-hover:text-accent transition-colors">{log.landmarkName}</h4>
                          <p className="text-xs text-text-dim mt-1 font-medium">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Processing...'}
                          </p>
                        </div>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <Sparkles className="w-4 h-4 text-accent" />
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Audio Element */}
      <audio 
        ref={audioRef} 
        onEnded={() => {
          setIsAudioPlaying(false);
          setIsAudioPaused(false);
        }}
        className="hidden" 
      />

      {/* Global Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.2);
        }
      `}</style>
    </div>
  );
}
