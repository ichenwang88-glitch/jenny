/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback, ChangeEvent, useMemo } from 'react';
import { Volume2, Play, BookOpen, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_TIMESTAMPS } from './data/timestamps';

// Text content extracted from the image
const SPEECH_TITLE = "Morning habits for a better school day";
const CONTENT_DATA = [
  { en: "Morning habits for a better school day", zh: "開啟美好校園生活的一天早晨習慣" },
  { en: "Students have different morning habits.", zh: "學生們有不同的早晨習慣。" },
  { en: "Some students make their beds and some don't.", zh: "有些學生會整理床鋪，有些則不會。" },
  { en: "There is one thing that's very important: eating a healthy breakfast.", zh: "有一件事非常重要：吃一份健康的早餐。" },
  { en: "Do you always eat breakfast in the morning?", zh: "你早上總是會吃早餐嗎？" },
  { en: "Eating breakfast helps you do better in school.", zh: "吃早餐能幫助你在學校表現得更好。" },
  { en: "It helps you feel good, too!", zh: "它也能讓你感覺很棒！" },
  { en: "Do you clean your room every day?", zh: "你每天都會打掃房間嗎？" },
  { en: "Cleaning your room can keep it tidy.", zh: "打掃房間可以保持整潔。" },
  { en: "Then, you can have more time for fun.", zh: "這樣你就有更多時間玩樂。" },
  { en: "It helps keep you happy, too.", zh: "這也能讓你保持快樂。" },
  { en: "Do you often exercise in the morning?", zh: "你常在早上運動嗎？" },
  { en: "It can help you wake up.", zh: "它可以幫助你清醒。" },
  { en: "It can also keep you healthy.", zh: "它也能讓你保持健康。" },
  { en: "What good morning habits do you have?", zh: "你有什麼好的早晨習慣呢？" }
];

const WORD_DICT: Record<string, string> = {
  "morning": "早晨", "habits": "習慣", "better": "更好的", "school": "學校", "day": "天",
  "students": "學生們", "have": "有", "different": "不同的", "some": "有些", "make": "製作/整理",
  "their": "他們的", "beds": "床鋪", "and": "和", "don't": "不", "there": "那裡/有",
  "is": "是", "one": "一", "thing": "事情", "that's": "那是", "very": "非常",
  "important": "重要的", "eating": "吃", "healthy": "健康的", "breakfast": "早餐",
  "do": "做/助動詞", "you": "你", "always": "總是", "eat": "吃", "in": "在...裡面",
  "the": "這", "helps": "幫助", "feel": "感覺", "good": "好的",
  "too": "也", "clean": "打掃/乾淨", "room": "房間", "every": "每天", "can": "可以",
  "keep": "保持", "it": "它", "tidy": "整潔", "then": "然後", "more": "更多",
  "time": "時間", "for": "為了", "fun": "樂趣", "happy": "快樂", "often": "經常",
  "exercise": "運動", "help": "幫助", "wake": "醒來", "up": "起來", "also": "也",
  "what": "什麼", "a": "一個"
};

const SENTENCES = CONTENT_DATA.map(d => d.en);

// IndexedDB helpers for persisting audio file
const DB_NAME = 'SpeechBuddyDB';
const STORE_NAME = 'AudioStore';
const AUDIO_KEY = 'teacher_audio';

const saveAudioToDB = async (file: Blob) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(file, AUDIO_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
};

const loadAudioFromDB = async (): Promise<Blob | null> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(AUDIO_KEY);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  });
};

const deleteAudioFromDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(AUDIO_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
};

export default function App() {
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teacherAudio, setTeacherAudio] = useState<HTMLAudioElement | null>(null);
  const [teacherBuffer, setTeacherBuffer] = useState<AudioBuffer | null>(null);
  const [isAligning, setIsAligning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [alignIndex, setAlignIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(0.7);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFineTuning, setIsFineTuning] = useState(false);
  const [isTeacherMode, setIsTeacherMode] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const isPlayingRef = useRef<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const audioCache = useRef<Map<string, string>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeGainRef = useRef<GainNode | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !teacherBuffer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = teacherBuffer.getChannelData(0);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Zoom settings: show 4 seconds of audio at a time
    const zoomDuration = 4; 
    const playTime = teacherAudio?.currentTime || 0;
    const startViewTime = Math.max(0, playTime - zoomDuration / 2);
    const endViewTime = startViewTime + zoomDuration;

    const startSample = Math.floor(startViewTime * teacherBuffer.sampleRate);
    const endSample = Math.floor(endViewTime * teacherBuffer.sampleRate);
    const samplesToDraw = endSample - startSample;
    const step = Math.ceil(samplesToDraw / width);

    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.strokeStyle = '#10b981'; 
    ctx.lineWidth = 1.5;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const idx = startSample + (i * step) + j;
        if (idx >= 0 && idx < data.length) {
          const datum = data[idx];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }
      if (min <= max) {
        ctx.lineTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
      }
    }
    ctx.stroke();

    // Draw existing timestamps in view
    wordTimestamps.forEach((ts) => {
      if (ts.start >= startViewTime && ts.start <= endViewTime) {
        const x = ((ts.start - startViewTime) / zoomDuration) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#059669';
        ctx.font = '10px sans-serif';
        ctx.fillText(ts.word, x + 4, 15);
      }
    });

    // Draw playhead (always in the middle if possible)
    const playheadX = ((playTime - startViewTime) / zoomDuration) * width;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.strokeStyle = '#f59e0b'; 
    ctx.lineWidth = 3;
    ctx.stroke();
    
    setCurrentTime(playTime);

    requestRef.current = requestAnimationFrame(drawWaveform);
  }, [teacherBuffer, teacherAudio]);

  useEffect(() => {
    if (isAligning) {
      requestRef.current = requestAnimationFrame(drawWaveform);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isAligning, drawWaveform]);

  const allWords = useMemo(() => SENTENCES.join(" ").split(" ").map(w => ({
    original: w,
    clean: w.replace(/[.,:!?]/g, "").toLowerCase()
  })), []);

  const sentenceWordRanges = useMemo(() => {
    let currentIdx = 0;
    return SENTENCES.map(sentence => {
      const wordCount = sentence.split(" ").length;
      const range = { start: currentIdx, end: currentIdx + wordCount - 1 };
      currentIdx += wordCount;
      return range;
    });
  }, []);

  // Pre-defined timestamps for the specific teacher's audio. 
  // You can update these values here and the app will be "pre-split" forever.
  const [wordTimestamps, setWordTimestamps] = useState<any[]>(() => {
    const saved = localStorage.getItem('speech_timestamps');
    if (saved) return JSON.parse(saved);
    
    // Use the integrated default timestamps
    return DEFAULT_TIMESTAMPS;
  });

  useEffect(() => {
    // Load saved audio from IndexedDB
    const loadSavedAudio = async () => {
      try {
        const blob = await loadAudioFromDB();
        if (blob) {
          initAudio();
          const arrayBuffer = await blob.arrayBuffer();
          const decodedBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
          setTeacherBuffer(decodedBuffer);

          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          setTeacherAudio(audio);
        }
      } catch (err) {
        console.error("Failed to load saved audio:", err);
      }
    };
    loadSavedAudio();
  }, []);

  // Initialize AudioContext on first user interaction
  useEffect(() => {
    const autoLoadAudio = async () => {
      try {
        // Try to load from IndexedDB first
        const savedAudio = await loadAudioFromDB();
        if (savedAudio) {
          const url = URL.createObjectURL(savedAudio);
          const audio = new Audio(url);
          setTeacherAudio(audio);
          
          const arrayBuffer = await savedAudio.arrayBuffer();
          initAudio();
          const decodedBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
          setTeacherBuffer(decodedBuffer);
          return;
        }

        // If not in DB, try to load the default integrated audio file
        // Note: The user must place 'audio.mp3' in the public folder
        const response = await fetch('/audio.mp3');
        if (response.ok) {
          const blob = await response.blob();
          
          if (blob.size < 100) {
            console.warn("audio.mp3 is too small or empty, skipping auto-load.");
            return;
          }

          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          setTeacherAudio(audio);
          
          const arrayBuffer = await blob.arrayBuffer();
          initAudio();
          const decodedBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
          setTeacherBuffer(decodedBuffer);
          
          // Save to DB for faster subsequent loads
          await saveAudioToDB(blob);
        }
      } catch (err) {
        console.log("No default audio found or failed to load:", err);
      }
    };

    autoLoadAudio();
  }, []);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const startManualAlignment = () => {
    if (!teacherAudio) return;
    setIsAligning(true);
    setIsPaused(false);
    setAlignIndex(0);
    setWordTimestamps([]);
    teacherAudio.currentTime = 0;
    teacherAudio.playbackRate = playbackRate;
    teacherAudio.play();
  };

  const togglePauseAlignment = () => {
    if (!teacherAudio) return;
    if (isPaused) {
      teacherAudio.play();
      setIsPaused(false);
    } else {
      teacherAudio.pause();
      setIsPaused(true);
    }
  };

  const undoLastAlign = () => {
    if (alignIndex === 0) return;
    const newIndex = alignIndex - 1;
    setAlignIndex(newIndex);
    const newTimestamps = wordTimestamps.slice(0, newIndex);
    setWordTimestamps(newTimestamps);
    
    // Seek back to the start of the word we are undoing
    if (newIndex > 0 && newTimestamps[newIndex - 1]) {
      teacherAudio!.currentTime = newTimestamps[newIndex - 1].start;
    } else {
      teacherAudio!.currentTime = 0;
    }
  };

  const handleAlignClick = () => {
    if (!isAligning || !teacherAudio) return;

    // Compensate for human reaction time (~0.1s)
    const REACTION_COMPENSATION = 0.1;
    const currentTime = Math.max(0, teacherAudio.currentTime - REACTION_COMPENSATION);
    const newTimestamps = [...wordTimestamps];

    // Set end of previous word
    if (alignIndex > 0) {
      // Slightly subtract from end to avoid bleeding into next word
      newTimestamps[alignIndex - 1].end = Math.max(newTimestamps[alignIndex - 1].start + 0.05, currentTime - 0.02);
    }

    // Set start of current word
    if (alignIndex < allWords.length) {
      newTimestamps.push({
        word: allWords[alignIndex].clean,
        start: currentTime,
        end: currentTime + 0.5 
      });
      setWordTimestamps(newTimestamps);
      setAlignIndex(alignIndex + 1);
    } else {
      // Finished
      setIsAligning(false);
      teacherAudio.playbackRate = 1.0;
      teacherAudio.pause();
    }
  };

  const stopAlignment = () => {
    setIsAligning(false);
    if (teacherAudio) {
      teacherAudio.pause();
      teacherAudio.playbackRate = 1.0;
    }
  };

  useEffect(() => {
    localStorage.setItem('speech_timestamps', JSON.stringify(wordTimestamps));
  }, [wordTimestamps]);

  const exportTimestamps = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(wordTimestamps, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "speech_data.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      initAudio();
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
      setTeacherBuffer(decodedBuffer);

      // Save to IndexedDB for persistence
      await saveAudioToDB(file);
      
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      setTeacherAudio(audio);
      setError(null);
    } catch (err) {
      console.error("Failed to save audio:", err);
      setError("無法處理音訊檔案。請確保它是正確的 MP3 格式。");
    }
  };

  const removeAudio = async () => {
    try {
      await deleteAudioFromDB();
      setTeacherAudio(null);
      setTeacherBuffer(null);
      setWordTimestamps(allWords.map((w, i) => ({
        word: w.clean,
        start: i * 0.6,
        end: (i + 1) * 0.6
      })));
      localStorage.removeItem('speech_timestamps');
    } catch (err) {
      console.error("Failed to delete audio:", err);
    }
  };

  const handleImportTimestamps = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setWordTimestamps(json);
          localStorage.setItem('speech_timestamps', JSON.stringify(json));
          setError(null);
          alert("分割數據匯入成功！");
        }
      } catch (err) {
        setError("匯入失敗：無效的 JSON 檔案。");
      }
    };
    reader.readAsText(file);
  };

  const playTeacherSegment = (start: number, end: number, padding: number = 0) => {
    if (!teacherBuffer || !audioContextRef.current) return;
    
    initAudio();
    
    // Stop any current playback with a quick fade out
    if (activeSourceRef.current) {
      try {
        const now = audioContextRef.current.currentTime;
        activeGainRef.current?.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        activeSourceRef.current.stop(now + 0.05);
      } catch (e) { /* ignore */ }
    }

    const source = audioContextRef.current.createBufferSource();
    const gainNode = audioContextRef.current.createGain();
    
    source.buffer = teacherBuffer;
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    const startTime = audioContextRef.current.currentTime;
    const duration = Math.max(0.01, end - start + padding);
    
    // Smooth fade in and fade out to prevent "weird" clicks
    // Ensure fade times don't exceed duration
    const fadeInTime = Math.min(0.02, duration / 2);
    const fadeOutTime = Math.min(0.05, duration / 2);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + fadeInTime);
    gainNode.gain.setValueAtTime(1, Math.max(startTime + fadeInTime, startTime + duration - fadeOutTime));
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
    
    source.start(startTime, start, duration);
    
    activeSourceRef.current = source;
    activeGainRef.current = gainNode;
    
    source.onended = () => {
      if (activeSourceRef.current === source) {
        setIsSpeaking(null);
        setActiveWordIndex(null);
        isPlayingRef.current = null;
      }
    };
  };

  const playAudio = async (text: string, isSentence: boolean = false, sIdx?: number, wIdx?: number) => {
    // Stop any existing animation
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }

    // If we have teacher audio, use the timestamps
    if (teacherAudio && wordTimestamps.length > 0) {
      if (isSentence && sIdx !== undefined) {
        const range = sentenceWordRanges[sIdx];
        const firstWord = wordTimestamps[range.start];
        const lastWord = wordTimestamps[range.end];
        
        if (firstWord && lastWord) {
          playTeacherSegment(firstWord.start, lastWord.end, 0.05);
          setIsSpeaking(text);
          isPlayingRef.current = text;

          // Start word highlighting timer
          const startTime = audioContextRef.current!.currentTime;
          const sentenceStart = firstWord.start;
          const totalDuration = lastWord.end - firstWord.start + 0.05;
          
          const updateHighlight = () => {
            if (!audioContextRef.current || isPlayingRef.current !== text) {
              setActiveWordIndex(null);
              return;
            }

            const elapsed = audioContextRef.current.currentTime - startTime;
            const currentAudioTime = sentenceStart + elapsed;
            
            // Find which word we are currently on
            let foundIdx = null;
            for (let i = range.start; i <= range.end; i++) {
              const ts = wordTimestamps[i];
              // Add a small buffer to the end to make the highlight feel more natural
              if (currentAudioTime >= ts.start && currentAudioTime <= ts.end + 0.02) {
                foundIdx = i;
                break;
              }
            }
            
            setActiveWordIndex(foundIdx);
            
            if (elapsed < totalDuration) {
              requestRef.current = requestAnimationFrame(updateHighlight);
            } else {
              setActiveWordIndex(null);
            }
          };
          
          requestRef.current = requestAnimationFrame(updateHighlight);
          return;
        }
      } else if (!isSentence && sIdx !== undefined && wIdx !== undefined) {
        // Find the specific word in the specific sentence
        const range = sentenceWordRanges[sIdx];
        const globalIdx = range.start + wIdx;
        const timestamp = wordTimestamps[globalIdx];
        if (timestamp) {
          playTeacherSegment(timestamp.start, timestamp.end, 0.05);
          setIsSpeaking(text);
          isPlayingRef.current = text;
          setActiveWordIndex(globalIdx);
          return;
        }
      } else {
        // Fallback to first occurrence if no indices provided
        const cleanText = text.replace(/[.,:!?]/g, "").toLowerCase();
        const timestampIdx = wordTimestamps.findIndex(t => t.word === cleanText);
        if (timestampIdx !== -1) {
          const timestamp = wordTimestamps[timestampIdx];
          playTeacherSegment(timestamp.start, timestamp.end, 0.05);
          setIsSpeaking(text);
          isPlayingRef.current = text;
          setActiveWordIndex(timestampIdx);
          return;
        }
      }
    }
    
    // Fallback to Gemini TTS only if no teacher audio
    if (!teacherAudio) {
      setError("請先上傳老師的 MP3 語音檔案。");
    }
  };

  const nudgeTimestamp = (idx: number, field: 'start' | 'end', amount: number) => {
    const newTimestamps = [...wordTimestamps];
    newTimestamps[idx] = {
      ...newTimestamps[idx],
      [field]: Math.max(0, newTimestamps[idx][field] + amount)
    };
    setWordTimestamps(newTimestamps);
    
    // Play the adjusted segment to hear the difference
    playTeacherSegment(newTimestamps[idx].start, newTimestamps[idx].end, 0.05);
  };

  const handleWordHover = (word: string, sIdx: number, wIdx: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Debounce hover
    hoverTimeoutRef.current = setTimeout(() => {
      const cleanWord = word.replace(/[.,:!?]/g, "");
      if (cleanWord.length > 0) {
        playAudio(cleanWord, false, sIdx, wIdx);
      }
    }, 250);
  };

  return (
    <div className="min-h-screen bg-[#fdfcf8] text-[#2c3e50] font-sans selection:bg-emerald-100">
      {/* Only show critical error during upload */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
          >
            <div className="shadow-xl rounded-2xl p-4 flex items-center justify-between gap-4 border bg-red-50 border-red-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-100 text-red-600">
                  <Volume2 size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-800">
                    發生錯誤
                  </p>
                  <p className="text-xs text-red-600">
                    {error}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                關閉
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="max-w-4xl mx-auto pt-12 pb-8 px-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-4"
        >
          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
            <BookOpen size={24} />
          </div>
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-700/70">
            English Speech Practice
          </span>
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          onDoubleClick={() => setIsTeacherMode(!isTeacherMode)}
          className="text-4xl md:text-5xl font-serif font-bold text-[#1a2a3a] leading-tight cursor-default select-none"
        >
          英語朗讀練習
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-4 text-lg text-slate-500 max-w-2xl"
        >
          Hover over any word to hear its pronunciation. Click the speaker icon to hear the whole sentence.
        </motion.p>

        {/* Teacher Voice Upload */}
        {isTeacherMode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center gap-4"
          >
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => teacherAudio ? removeAudio() : fileInputRef.current?.click()}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
              teacherAudio 
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 group' 
                : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'
            }`}
          >
            <Volume2 size={20} />
            <span className={teacherAudio ? "group-hover:hidden" : ""}>
              {teacherAudio ? "老師語音已儲存" : "上傳老師 MP3"}
            </span>
            {teacherAudio && (
              <span className="hidden group-hover:inline">移除語音</span>
            )}
          </button>

          {teacherAudio && !isAligning && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={startManualAlignment}
                  className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
                >
                  <Sparkles size={20} />
                  開始手動校準 (慢速模式)
                </button>
                <button
                  onClick={exportTimestamps}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all"
                >
                  下載分割數據
                </button>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  ref={importInputRef}
                  onChange={handleImportTimestamps}
                />
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all"
                >
                  匯入分割數據
                </button>
                <button
                  onClick={() => setIsFineTuning(!isFineTuning)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
                    isFineTuning ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <BookOpen size={20} />
                  {isFineTuning ? "退出微調模式" : "開啟微調模式"}
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-100 px-4 py-2 rounded-xl">
                <span>校準速度：</span>
                {[0.5, 0.7, 0.8, 1.0].map(speed => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackRate(speed)}
                    className={`px-2 py-1 rounded-lg transition-colors ${playbackRate === speed ? 'bg-emerald-600 text-white' : 'hover:bg-slate-200'}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {isAligning && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-8">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">手動校準中...</h3>
                  <p className="text-slate-500">當老師唸到下方單字時，請點擊大按鈕或按空白鍵</p>
                </div>

                <div className="flex flex-col items-center gap-2 w-full">
                  <span className="text-sm font-bold text-emerald-600 uppercase tracking-widest">放大波形 (當前播放位置)</span>
                  <div className="w-full bg-slate-900 rounded-2xl border-4 border-slate-800 overflow-hidden relative h-40 shadow-inner">
                    <canvas 
                      ref={canvasRef} 
                      width={800} 
                      height={160} 
                      className="w-full h-full"
                    />
                    <div className="absolute inset-y-0 left-1/2 w-0.5 bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)] z-10" />
                  </div>
                  <p className="text-xs text-slate-400">波形會隨著聲音滾動，請在波形隆起前點擊</p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm font-bold text-emerald-600 uppercase tracking-widest">Next Word</span>
                  <div className="text-6xl font-black text-slate-900 bg-slate-50 px-12 py-8 rounded-3xl border-4 border-emerald-100">
                    {allWords[alignIndex]?.original || "完成！"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full">
                  <button
                    onClick={handleAlignClick}
                    className="col-span-2 py-10 bg-emerald-600 text-white rounded-3xl text-3xl font-black shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all"
                  >
                    點擊標記 (CLICK)
                  </button>
                  <button
                    onClick={togglePauseAlignment}
                    className="py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    {isPaused ? "繼續播放" : "暫停"}
                  </button>
                  <button
                    onClick={undoLastAlign}
                    disabled={alignIndex === 0}
                    className="py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    回上一個單字
                  </button>
                  <button
                    onClick={stopAlignment}
                    className="col-span-2 py-4 text-slate-400 font-medium hover:text-red-500 transition-colors"
                  >
                    取消並退出
                  </button>
                </div>

                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300" 
                    style={{ width: `${(alignIndex / allWords.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {teacherAudio && !isAligning && (
            <span className="text-xs text-slate-400 italic">
              Using teacher's voice. If words are off, use "Manual Alignment".
            </span>
          )}
        </motion.div>
        )}

        {isTeacherMode && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-widest border border-amber-200">
            <Sparkles size={12} />
            Teacher Mode Active
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 pb-24">
        <div className="space-y-6">
          {SENTENCES.map((sentence, sIdx) => (
            <motion.div
              key={sIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * sIdx }}
              className="group relative p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-100 transition-all duration-300"
            >
              <div className="flex flex-col gap-2 pr-12">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                  {sentence.split(" ").map((word, wIdx) => {
                  const globalIdx = sentenceWordRanges[sIdx].start + wIdx;
                  const ts = wordTimestamps[globalIdx];
                  const isActive = activeWordIndex === globalIdx;
                  
                  return (
                    <div key={wIdx} className="flex flex-col items-center gap-1 group/word relative">
                      <motion.span
                        onMouseEnter={() => !isFineTuning && handleWordHover(word, sIdx, wIdx)}
                        onClick={() => {
                          if (isFineTuning) {
                            playTeacherSegment(ts.start, ts.end, 0.1);
                          } else {
                            // 手機點擊直接觸發發音與翻譯
                            playAudio(word.replace(/[.,:!?]/g, ""), false, sIdx, wIdx);
                          }
                        }}
                        animate={isActive ? { scale: 1.15, color: "#059669" } : { scale: 1, color: "#1a2a3a" }}
                        className={`cursor-help text-xl md:text-2xl font-medium transition-colors duration-200 py-1 px-1.5 rounded-md select-none touch-none active:bg-emerald-100 ${
                          isActive ? 'bg-emerald-50 ring-2 ring-emerald-200' : 
                          isFineTuning ? 'bg-amber-50 border border-amber-200' : 'hover:bg-emerald-50'
                        }`}
                        style={{ 
                          WebkitUserSelect: 'none', 
                          WebkitTouchCallout: 'none',
                          userSelect: 'none'
                        }}
                      >
                        {word}
                      </motion.span>
                      
                      {/* Word Translation Tooltip */}
                      {!isFineTuning && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/word:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                          {WORD_DICT[word.replace(/[.,:!?]/g, "").toLowerCase()] || "..."}
                        </div>
                      )}
                      
                      {isFineTuning && ts && (
                        <div className="flex flex-col gap-1 bg-white p-2 rounded-lg shadow-sm border border-slate-100 scale-75 origin-top">
                          <div className="flex items-center gap-2 justify-between">
                            <span className="text-[10px] font-bold text-slate-400">START</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => nudgeTimestamp(globalIdx, 'start', -0.05)} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded hover:bg-slate-200 text-xs">-</button>
                              <span className="text-[10px] font-mono w-10 text-center">{ts.start.toFixed(2)}s</span>
                              <button onClick={() => nudgeTimestamp(globalIdx, 'start', 0.05)} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded hover:bg-slate-200 text-xs">+</button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 justify-between">
                            <span className="text-[10px] font-bold text-slate-400">END</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => nudgeTimestamp(globalIdx, 'end', -0.05)} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded hover:bg-slate-200 text-xs">-</button>
                              <span className="text-[10px] font-mono w-10 text-center">{ts.end.toFixed(2)}s</span>
                              <button onClick={() => nudgeTimestamp(globalIdx, 'end', 0.05)} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded hover:bg-slate-200 text-xs">+</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
                <div className="text-sm text-slate-400 font-medium italic mt-2 border-t border-slate-50 pt-2">
                  {CONTENT_DATA[sIdx].zh}
                </div>
              </div>

              {/* Sentence Play Button */}
              <button
                onClick={() => playAudio(sentence, true, sIdx)}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full transition-all duration-300 ${
                  isSpeaking === sentence 
                    ? 'bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-200' 
                    : 'bg-slate-50 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 group-hover:opacity-100 opacity-40'
                }`}
                title="Play full sentence"
              >
                {isSpeaking === sentence ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Volume2 size={24} />
                  </motion.div>
                ) : (
                  <Play size={24} fill="currentColor" />
                )}
              </button>

              {/* Visual indicator for active sentence */}
              <AnimatePresence>
                {isSpeaking === sentence && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute bottom-0 left-0 h-1 bg-emerald-500 rounded-b-2xl origin-left w-full"
                  />
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Footer Tip */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-16 p-8 bg-emerald-50 rounded-3xl border border-emerald-100 flex flex-col md:flex-row items-center gap-6"
        >
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm">
            <Sparkles size={32} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-900">Learning Tip</h3>
            <p className="text-emerald-800/70">
              Listen to each word carefully, then try to repeat the whole sentence out loud. 
              Practice makes perfect!
            </p>
          </div>
        </motion.div>
      </main>

      {/* Background Decorative Elements */}
      <div className="fixed top-0 right-0 -z-10 w-96 h-96 bg-emerald-50/50 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
      <div className="fixed bottom-0 left-0 -z-10 w-64 h-64 bg-amber-50/50 blur-3xl rounded-full -translate-x-1/2 translate-y-1/2" />
    </div>
  );
}
