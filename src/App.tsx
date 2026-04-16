import React, { useState, useRef, useEffect } from 'react';
import { auth, db, googleProvider } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocFromServer, doc } from 'firebase/firestore';
import { Camera, History, LogOut, MapPin, Sparkles, Volume2, Loader2, Image as ImageIcon, Trash2, X } from 'lucide-react';
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
    try {
      setIsAudioPlaying(true);
      const base64Audio = await generateNarration(text);
      const audioBlob = b64toBlob(base64Audio, 'audio/wav');
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 backdrop-blur-md bg-black/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">CityLens</h1>
          </div>
          
          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs text-white/50 uppercase tracking-widest font-semibold">Explorer</span>
                <span className="text-sm font-medium">{user.displayName}</span>
              </div>
              <button 
                onClick={handleSignOut}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5 text-white/70" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleSignIn}
              className="px-4 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-orange-500 transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md"
            >
              <h2 className="text-5xl font-bold mb-6 leading-tight">Your AI-Powered City Guide.</h2>
              <p className="text-white/60 mb-8 text-lg">
                Snap a photo of any landmark and unlock its hidden history with real-time AI narration.
              </p>
              <button 
                onClick={handleSignIn}
                className="group flex items-center gap-3 px-8 py-4 bg-orange-500 text-black font-bold rounded-2xl hover:scale-105 transition-all shadow-xl shadow-orange-500/20"
              >
                Start Exploring
                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Action & Result */}
            <div className="lg:col-span-7 space-y-6">
              {/* Upload Card */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl py-12 px-4 hover:border-orange-500/50 transition-colors cursor-pointer group"
                     onClick={() => fileInputRef.current?.click()}>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Camera className="w-8 h-8 text-orange-500" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Capture Landmark</h3>
                  <p className="text-white/40 text-sm text-center">Take a photo or upload an image of a city landmark</p>
                </div>
              </div>

              {/* Result Area */}
              <AnimatePresence mode="wait">
                {isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white/5 border border-white/10 rounded-3xl p-12 flex flex-col items-center justify-center gap-4"
                  >
                    <div className="relative">
                      <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
                      <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-blue-400 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-bold mb-1">Analyzing Landmark...</h3>
                      <p className="text-white/40 text-sm">Gemini is identifying the site and fetching history</p>
                    </div>
                  </motion.div>
                )}

                {currentResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-sm"
                  >
                    <div className="relative aspect-video bg-black">
                      {currentImage && (
                        <img 
                          src={currentImage} 
                          alt="Captured" 
                          className="w-full h-full object-cover opacity-60"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                      <div className="absolute bottom-6 left-6 right-6">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="w-4 h-4 text-orange-500" />
                          <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Discovered</span>
                        </div>
                        <h2 className="text-4xl font-bold">{currentResult.name}</h2>
                      </div>
                    </div>
                    
                    <div className="p-8 space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => handlePlayNarration(currentResult.narrative)}
                            className={cn(
                              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                              isAudioPlaying ? "bg-orange-500 text-black animate-pulse" : "bg-white/10 text-white hover:bg-white/20"
                            )}
                          >
                            <Volume2 className="w-6 h-6" />
                          </button>
                          <div>
                            <p className="text-sm font-bold">AR Narration</p>
                            <p className="text-xs text-white/40">Listen to the history of this site</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-white/40">Historical Context</h4>
                        <p className="text-white/80 leading-relaxed text-lg">
                          {currentResult.history}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: Travel Log */}
            <div className="lg:col-span-5">
              <div className="sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-white/40" />
                    <h3 className="text-lg font-bold">Travel Log</h3>
                  </div>
                  <span className="text-xs font-bold bg-white/5 px-3 py-1 rounded-full text-white/40">
                    {logs.length} Discoveries
                  </span>
                </div>

                <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
                      <ImageIcon className="w-8 h-8 text-white/20 mx-auto mb-3" />
                      <p className="text-sm text-white/40">No discoveries yet.<br/>Start by snapping a photo!</p>
                    </div>
                  ) : (
                    logs.map((log) => (
                      <motion.div 
                        key={log.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="group relative bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4 hover:bg-white/10 transition-colors cursor-pointer"
                        onClick={() => {
                          setCurrentResult({
                            name: log.landmarkName,
                            history: log.history,
                            narrative: log.narrative
                          });
                          setCurrentImage(log.imageUrl);
                        }}
                      >
                        <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-black">
                          <img 
                            src={log.imageUrl} 
                            alt={log.landmarkName} 
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h4 className="font-bold truncate">{log.landmarkName}</h4>
                          <p className="text-xs text-white/40 mt-1">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : 'Just now'}
                          </p>
                        </div>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Sparkles className="w-4 h-4 text-orange-500" />
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
        onEnded={() => setIsAudioPlaying(false)}
        className="hidden" 
      />

      {/* Global Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
