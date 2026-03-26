import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, db, googleProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged
} from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit,
  addDoc,
  Timestamp,
  updateDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { 
  LogOut, 
  Menu, 
  X, 
  Home, 
  User as UserIcon, 
  Zap, 
  Ruler, 
  Sigma, 
  FileText, 
  Briefcase, 
  Monitor, 
  Brain, 
  Settings, 
  Crown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Plus,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';
import { User, Announcement, ActivityLog, LoginLog, QuizQuestion, UserRole } from './types';
import { FOLDER_MAP, PDF_LINKS, TOPIC_NAMES } from './constants';

// --- Components ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Don't throw if the user is signed out, as this is expected during logout
  if (!auth.currentUser) {
    console.warn("Ignoring Firestore error because user is signed out.");
    return;
  }
  
  // We log the error but do not throw to prevent the app from crashing
  // throw new Error(JSON.stringify(errInfo));
}

const LoadingScreen = ({ message = "Processing..." }: { message?: string }) => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 backdrop-blur-md">
    <div className="w-16 h-16 border-4 border-white/20 border-t-cyber-blue rounded-full animate-spin" />
    <p className="mt-4 text-cyber-blue font-orbitron animate-pulse">{message}</p>
  </div>
);

const Popup = ({ message, icon, onClose }: { message: string, icon: React.ReactNode, onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onClick={onClose}
  >
    <div className="glass p-8 rounded-2xl text-center max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
      <div className="text-4xl mb-4 flex justify-center">{icon}</div>
      <p className="text-lg mb-6">{message}</p>
      <button onClick={onClose} className="cyber-button w-full">OK</button>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activePage, setActivePage] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [popup, setPopup] = useState<{ message: string, icon: React.ReactNode } | null>(null);
  const [currentSubject, setCurrentSubject] = useState<string | null>(null);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [isInteracting, setIsInteracting] = useState(false);

  // Admin states
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check for redirect result if we used signInWithRedirect
    getRedirectResult(auth).then((result) => {
      if (result) {
        console.log("Redirect login succeeded for:", result.user.email);
      }
    }).catch((error) => {
      console.error("Redirect login error:", error);
      setPopup({ message: `Redirect login failed: ${error.message || 'Unknown error'}`, icon: <AlertCircle className="text-cyber-red" /> });
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // 1. Check if user is allowed via Google Sheets
        try {
          const checkRes = await fetch('/api/check-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: firebaseUser.email })
          });
          
          if (!checkRes.ok) {
            const text = await checkRes.text();
            throw new Error(`Server returned ${checkRes.status}: ${text.substring(0, 100)}`);
          }
          
          const { allowed, error } = await checkRes.json();
          
          if (!allowed) {
            await signOut(auth);
            setUser(null);
            setLoading(false);
            setLoginLoading(false);
            setPopup({ 
              message: error || "Access Denied. Your email is not on the allowed list.", 
              icon: <ShieldAlert className="text-cyber-red" /> 
            });
            return;
          }
        } catch (err: any) {
          console.error("Access check failed:", err);
          await signOut(auth);
          setUser(null);
          setLoading(false);
          setLoginLoading(false);
          setPopup({ message: `Failed to verify access: ${err?.message || 'Server error'}. Check Netlify logs.`, icon: <AlertCircle className="text-cyber-red" /> });
          return;
        }

        let userDoc;
        try {
          userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `users/${firebaseUser.uid}`);
          return;
        }
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          
          // Ensure old documents get updated with new required fields
          const updates: any = { status: 'ONLINE', flag: '' };
          if (!userData.username) updates.username = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
          if (!userData.role) updates.role = firebaseUser.email === 'mjdl05010710@gmail.com' ? 'superadmin' : 'user';
          if (!userData.uid) updates.uid = firebaseUser.uid;
          
          setUser({ ...userData, ...updates });
          
          // Log login
          try {
            await addDoc(collection(db, 'login_logs'), {
              timestamp: Timestamp.now(),
              username: updates.username || userData.username,
              status: 'SUCCESS',
              device: navigator.userAgent
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, 'login_logs');
          }
          
          // Update status to ONLINE and add missing fields
          try {
            await updateDoc(doc(db, 'users', firebaseUser.uid), updates);
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `users/${firebaseUser.uid}`);
          }
        } else {
          // Create new user if doesn't exist (default role: user)
          const newUser: any = {
            uid: firebaseUser.uid,
            username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            role: firebaseUser.email === 'mjdl05010710@gmail.com' ? 'superadmin' : 'user',
            status: 'ONLINE',
          };
          if (firebaseUser.photoURL) newUser.profilePic = firebaseUser.photoURL;
          try {
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${firebaseUser.uid}`);
          }
          setUser(newUser as User);
          
          // Log login for new user
          try {
            await addDoc(collection(db, 'login_logs'), {
              timestamp: Timestamp.now(),
              username: newUser.username,
              status: 'SUCCESS_NEW_USER',
              device: navigator.userAgent
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, 'login_logs');
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
      setLoginLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      // Listen for announcements
      const q = query(collection(db, 'announcements'), orderBy('timestamp', 'desc'), limit(10));
      const unsubAnnouncements = onSnapshot(q, (snapshot) => {
        setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'announcements');
      });

      // Listen for user status (to handle kicks)
      const unsubUser = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          const data = doc.data() as User;
          if (data.flag === 'KICKED') {
            handleLogout(true);
          }
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      });

      // Inactivity timer
      const resetTimer = () => {
        setIsInteracting(true);
        setTimeLeft(600);
        setTimeout(() => setIsInteracting(false), 2000);
      };

      window.addEventListener('mousedown', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('touchstart', resetTimer);

      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        unsubAnnouncements();
        unsubUser();
        window.removeEventListener('mousedown', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('touchstart', resetTimer);
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [user]);

  const handleLogin = async () => {
    console.log("Starting login process...");
    setLoginLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("signInWithPopup succeeded for:", result.user.email);
      // Loading state will be handled by onAuthStateChanged
    } catch (error: any) {
      console.error("Login Error details:", error);
      
      // Fallback to redirect if popup is blocked or unsupported
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/web-storage-unsupported') {
        console.log("Popup blocked or unsupported, falling back to redirect...");
        try {
          await signInWithRedirect(auth, googleProvider);
          return; // Exit early, redirect will handle the rest
        } catch (redirectError: any) {
          console.error("Redirect login failed:", redirectError);
          setPopup({ message: `Redirect login failed: ${redirectError.message || 'Unknown error'}`, icon: <AlertCircle className="text-cyber-red" /> });
        }
      } else if (error.code !== 'auth/popup-closed-by-user') {
        setPopup({ message: `Login failed: ${error.message || 'Unknown error'}`, icon: <AlertCircle className="text-cyber-red" /> });
      } else {
        console.log("User closed the popup manually.");
      }
      setLoginLoading(false);
    }
  };

  const handleLogout = async (kicked: boolean = false) => {
    if (user && auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { status: 'OFFLINE' });
      } catch (e) {
        console.error("Error updating status on logout:", e);
      }
      await signOut(auth);
      setUser(null);
      setActivePage('home');
      if (kicked) {
        setPopup({ message: "You were kicked by admin", icon: <AlertCircle className="text-cyber-red" /> });
      }
    }
  };

  const logActivity = async (action: string, details?: string) => {
    if (user) {
      const timestamp = new Date().toISOString();
      
      // 1. Log to Firestore
      try {
        const logData: any = {
          timestamp: serverTimestamp(),
          username: user.username,
          uid: user.uid,
          action,
        };
        if (details) logData.details = details;
        await addDoc(collection(db, 'activity_logs'), logData);
      } catch (e) {
        console.error("Firestore Log Error:", e);
      }

      // 2. Log to Google Sheets via Backend
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.username, // Using username as identifier for the sheet
            action,
            details: details || '',
            timestamp
          })
        });
      } catch (e) {
        console.error("Sheets Log Error:", e);
      }
    }
  };

  const openTopic = async (subject: string, topic: string) => {
    setCurrentSubject(subject);
    setCurrentTopic(topic);
    setActivePage('viewer');
    setViewerImages([]);
    setCurrentSlide(0);
    
    await logActivity('OPEN_TOPIC', `${subject}_${topic}`);

    const folderId = FOLDER_MAP[`${subject.toUpperCase()}_${topic}`];
    if (!folderId) {
      setPopup({ message: "Folder ID not found for this topic", icon: <AlertCircle className="text-cyber-red" /> });
      return;
    }

    try {
      const response = await fetch(`/api/drive/images/${folderId}`);
      const data = await response.json();
      if (data.images && data.images.length > 0) {
        setViewerImages(data.images);
      } else if (data.images && data.images.length === 0) {
        setPopup({ message: "No images found in this folder. Ensure the folder contains images and is shared publicly.", icon: <AlertCircle className="text-cyber-red" /> });
        setViewerImages([]);
      } else if (data.error === "Google Drive API key is not configured") {
        setPopup({ 
          message: "Google Drive API Key is missing. Please go to 'Settings' in AI Studio and add 'GOOGLE_DRIVE_API_KEY' to your secrets.", 
          icon: <ShieldAlert className="text-cyber-red" /> 
        });
      } else {
        throw new Error(data.error || "Failed to load images");
      }
    } catch (error: any) {
      console.error("Drive Error:", error);
      setPopup({ message: `Error: ${error.message || "Failed to load images"}. Please check your Google Drive API key in AI Studio Settings.`, icon: <AlertCircle className="text-cyber-red" /> });
    }
  };

  const startQuiz = async (subject: string, topic: string) => {
    setCurrentSubject(subject);
    setCurrentTopic(topic);
    setActivePage('quiz');
    setQuiz(null);
    setQuizIndex(0);
    setQuizScore(0);
    setQuizFeedback(null);

    await logActivity('QUIZ_START', `${subject}_${topic}`);

    const folderId = FOLDER_MAP[`${subject.toUpperCase()}_${topic}`];

    try {
      // 1. Try to fetch quiz.txt from Drive first
      if (folderId) {
        const driveRes = await fetch(`/api/drive/quiz/${folderId}`);
        const driveData = await driveRes.json();
        
        if (driveData.quiz) {
          const lines = (driveData.quiz as string).split('\n').filter(l => l.trim());
          const driveQuiz: QuizQuestion[] = lines.map(line => {
            const p = line.split('|');
            const type = p[0];
            if (type === 'mcq') {
              return { type: 'mcq', q: p[1], options: [p[2], p[3], p[4], p[5]], a: Number(p[6]) };
            } else if (type === 'identification') {
              return { type: 'identification', q: p[1], answer: p[2] };
            } else if (type === 'enumeration') {
              return { type: 'enumeration', q: p[1], answers: p[2].split(',').map(a => a.trim().toLowerCase()) };
            }
            return null;
          }).filter(q => q !== null) as QuizQuestion[];

          if (driveQuiz.length > 0) {
            setQuiz(driveQuiz);
            return;
          }
        }
      }

      // 2. Fallback to Gemini AI if no quiz.txt found
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Generate 5 multiple choice questions for the topic "${topic}" in ${subject}. 
      Return the result as a JSON array of objects with the following structure:
      {
        "q": "Question text",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "a": 0 // index of the correct option
      }`;
      
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }]
      });
      
      const text = result.text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        setQuiz(JSON.parse(jsonMatch[0]));
      } else {
        throw new Error("Failed to parse quiz JSON");
      }
    } catch (error) {
      console.error("Quiz Error:", error);
      setPopup({ message: "Failed to load quiz", icon: <AlertCircle className="text-cyber-red" /> });
    }
  };

  const handleQuizAnswer = (index: number) => {
    if (!quiz || quizFeedback) return;

    const correct = quiz[quizIndex].a === index;
    if (correct) {
      setQuizScore(prev => prev + 1);
      setQuizFeedback("✅ Correct!");
    } else {
      setQuizFeedback(`❌ Wrong! Correct answer: ${quiz[quizIndex].options?.[quiz[quizIndex].a as number]}`);
    }

    setTimeout(() => {
      if (quizIndex < quiz.length - 1) {
        setQuizIndex(prev => prev + 1);
        setQuizFeedback(null);
      } else {
        // Quiz finished
        logActivity('QUIZ_FINISH', `Score: ${quizScore + (correct ? 1 : 0)}/${quiz.length}`);
      }
    }, 2000);
  };

  const loadAdminData = async () => {
    if (user?.role === 'admin' || user?.role === 'superadmin') {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        setAllUsers(usersSnap.docs.map(doc => doc.data() as User));
        
        const logsSnap = await getDocs(query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(50)));
        setActivityLogs(logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'admin_data');
      }
    }
  };

  useEffect(() => {
    if (activePage === 'admin') {
      loadAdminData();
    }
  }, [activePage]);

  const kickUser = async (targetUid: string) => {
    if (user?.role === 'superadmin') {
      try {
        await updateDoc(doc(db, 'users', targetUid), { flag: 'KICKED', status: 'OFFLINE' });
        setPopup({ message: "User kicked", icon: <CheckCircle2 className="text-cyber-green" /> });
        loadAdminData();
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-10 rounded-3xl text-center w-full max-w-md mx-4"
        >
          <h1 className="text-4xl font-black cyber-text mb-8">Justine & Friends</h1>
          <p className="text-white/60 mb-8">Welcome to the futuristic learning portal. Please sign in to continue.</p>
          <button 
            onClick={handleLogin} 
            disabled={loginLoading}
            className="cyber-button w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loginLoading ? "Logging in..." : "Login with Google"}
          </button>
        </motion.div>
      </div>
    );
  }

  const subjects = [
    { id: 'physics', name: 'Physics', icon: <Zap className="text-yellow-400" />, color: 'from-yellow-400/20 to-orange-500/20' },
    { id: 'mfe', name: 'MFE 2', icon: <Ruler className="text-blue-400" />, color: 'from-blue-400/20 to-indigo-500/20' },
    { id: 'integral', name: 'Integral', icon: <Sigma className="text-purple-400" />, color: 'from-purple-400/20 to-pink-500/20' },
    { id: 'tcw', name: 'TCW', icon: <FileText className="text-green-400" />, color: 'from-green-400/20 to-emerald-500/20' },
    { id: 'entrep', name: 'ENTREP', icon: <Briefcase className="text-orange-400" />, color: 'from-orange-400/20 to-red-500/20' },
    { id: 'lite', name: 'LITE', icon: <Monitor className="text-cyan-400" />, color: 'from-cyan-400/20 to-blue-500/20' },
    { id: 'uts', name: 'UTS', icon: <Brain className="text-pink-400" />, color: 'from-pink-400/20 to-rose-500/20' },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <AnimatePresence>
        {popup && <Popup message={popup.message} icon={popup.icon} onClose={() => setPopup(null)} />}
      </AnimatePresence>

      {/* Taskbar */}
      <header className="fixed top-0 left-0 right-0 h-14 glass flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <Menu size={20} />
          </button>
          <h2 className="cyber-text text-lg hidden sm:block">Justine & Friends</h2>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-black/40 px-3 py-1 rounded-lg text-sm font-mono flex items-center gap-2">
            <span className="animate-pulse text-cyber-blue">⏳</span>
            {formatTime(timeLeft)}
          </div>
          <button onClick={() => handleLogout(false)} className="p-2 bg-cyber-red/20 hover:bg-cyber-red/40 text-cyber-red rounded-lg transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "pt-14 glass transition-all duration-300 flex flex-col z-40",
        sidebarCollapsed ? "w-16" : "w-64"
      )}>
        <div className="p-4 flex flex-col items-center border-bottom border-white/10">
          <div className="relative group">
            <img 
              src={user.profilePic || "https://cdn-icons-png.flaticon.com/512/847/847969.png"} 
              alt="Profile" 
              className={cn(
                "rounded-full border-2 border-white/30 transition-all duration-300 group-hover:scale-110 group-hover:border-cyber-blue",
                sidebarCollapsed ? "w-10 h-10" : "w-20 h-20"
              )}
            />
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-cyber-green rounded-full border-2 border-black shadow-[0_0_10px_#00ffc8] animate-pulse" />
          </div>
          {!sidebarCollapsed && (
            <div className="mt-3 text-center">
              <h3 className="font-bold text-sm">{user.username}</h3>
              <div className={cn(
                "mt-1 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                user.role === 'superadmin' ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-black shadow-[0_0_10px_gold]" :
                user.role === 'admin' ? "bg-cyber-blue/30 text-cyber-blue" : "bg-white/10 text-white/60"
              )}>
                {user.role}
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-2">
          <SidebarItem 
            icon={<Home size={20} />} 
            label="Dashboard" 
            active={activePage === 'home'} 
            collapsed={sidebarCollapsed} 
            onClick={() => setActivePage('home')} 
          />
          <SidebarItem 
            icon={<UserIcon size={20} />} 
            label="Profile" 
            active={activePage === 'profile'} 
            collapsed={sidebarCollapsed} 
            onClick={() => setActivePage('profile')} 
          />
          
          <div className="h-px bg-white/10 my-2" />
          
          {subjects.map(sub => (
            <SidebarItem 
              key={sub.id}
              icon={sub.icon} 
              label={sub.name} 
              active={activePage === sub.id} 
              collapsed={sidebarCollapsed} 
              onClick={() => setActivePage(sub.id)} 
            />
          ))}

          {(user.role === 'admin' || user.role === 'superadmin') && (
            <>
              <div className="h-px bg-white/10 my-2" />
              <SidebarItem 
                icon={<Settings size={20} />} 
                label="Admin" 
                active={activePage === 'admin'} 
                collapsed={sidebarCollapsed} 
                onClick={() => setActivePage('admin')} 
              />
            </>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pt-14 overflow-y-auto relative">
        <div className="p-6 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activePage === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <h1 className="text-4xl font-black cyber-text">Dashboard</h1>
                  <p className="text-white/40">Welcome back, {user.username}. Ready to learn?</p>
                </div>

                <div className="glass p-8 rounded-3xl space-y-6">
                  <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                    <span className="text-2xl">📢</span>
                    <h2 className="text-xl font-bold font-orbitron">Announcements</h2>
                  </div>
                  <div className="space-y-4">
                    {announcements.length > 0 ? announcements.map(ann => (
                      <div key={ann.id} className="p-4 bg-white/5 rounded-xl border-l-4 border-cyber-blue">
                        <p className="text-white/80">{ann.text}</p>
                        <span className="text-[10px] text-white/30 mt-2 block">
                          {ann.timestamp?.toDate().toLocaleString()}
                        </span>
                      </div>
                    )) : (
                      <p className="text-white/30 italic">No announcements yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {subjects.map(sub => (
                    <motion.div 
                      key={sub.id}
                      whileHover={{ scale: 1.02, y: -5 }}
                      className={cn("glass p-6 rounded-2xl cursor-pointer group relative overflow-hidden", sub.color)}
                      onClick={() => setActivePage(sub.id)}
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        {React.cloneElement(sub.icon as React.ReactElement, { size: 80 })}
                      </div>
                      <div className="relative z-10 space-y-4">
                        <div className="w-12 h-12 glass rounded-xl flex items-center justify-center">
                          {sub.icon}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold font-orbitron">{sub.name}</h3>
                          <p className="text-sm text-white/40">Explore topics and quizzes</p>
                        </div>
                        <button className="cyber-button w-full py-2 text-sm">Open Subject</button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {subjects.some(s => s.id === activePage) && (
              <motion.div 
                key={activePage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <h1 className="text-4xl font-black cyber-text uppercase">{activePage}</h1>
                  <p className="text-white/40">Master your skills in {activePage}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {Array.from({ length: 8 }, (_, i) => i + 1).map(num => (
                    <div key={num} className="glass p-6 rounded-2xl space-y-4 hover:bg-white/10 transition-colors group">
                      <div className="text-3xl opacity-40 group-hover:opacity-100 transition-opacity">📚</div>
                      <h3 className="font-bold text-lg">{TOPIC_NAMES[activePage.toUpperCase()]?.[num-1] || `Topic ${num}`}</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => openTopic(activePage, `TOPIC${num}`)}
                          className="bg-white/10 hover:bg-white/20 py-2 rounded-lg text-xs font-bold"
                        >
                          Open
                        </button>
                        <button 
                          onClick={() => startQuiz(activePage, `TOPIC${num}`)}
                          className="cyber-button py-2 rounded-lg text-xs font-bold"
                        >
                          Quiz
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="glass p-6 rounded-2xl space-y-4 border-dashed border-cyber-blue/30">
                    <div className="text-3xl">📖</div>
                    <h3 className="font-bold text-lg">Midterm Reviewer</h3>
                    <button className="cyber-button w-full py-2 text-sm">Open PDF</button>
                  </div>
                  
                  <div className="glass p-6 rounded-2xl space-y-4 border-dashed border-cyber-green/30">
                    <div className="text-3xl">🎯</div>
                    <h3 className="font-bold text-lg">Final Reviewer</h3>
                    <button className="cyber-button w-full py-2 text-sm">Open PDF</button>
                  </div>
                </div>
              </motion.div>
            )}

            {activePage === 'viewer' && (
              <motion.div 
                key="viewer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <button onClick={() => setActivePage(currentSubject || 'home')} className="flex items-center gap-2 text-cyber-blue hover:underline">
                  <ChevronLeft size={20} /> Back to Topics
                </button>
                
                <div className="relative glass rounded-3xl overflow-hidden aspect-video group">
                  {viewerImages.length > 0 ? (
                    <>
                      <img 
                        src={viewerImages[currentSlide]} 
                        alt="Topic Slide" 
                        className="w-full h-full object-contain cursor-zoom-in"
                        onClick={() => setFullscreen(true)}
                      />
                      
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-1 rounded-full text-sm font-mono">
                        {currentSlide + 1} / {viewerImages.length}
                      </div>

                      <button 
                        onClick={() => setCurrentSlide(prev => (prev - 1 + viewerImages.length) % viewerImages.length)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      
                      <button 
                        onClick={() => setCurrentSlide(prev => (prev + 1) % viewerImages.length)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ChevronRight size={24} />
                      </button>

                      <button 
                        onClick={() => setFullscreen(true)}
                        className="absolute top-4 right-4 p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Maximize2 size={20} />
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="animate-spin text-cyber-blue" size={40} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activePage === 'quiz' && (
              <motion.div 
                key="quiz"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-2xl mx-auto space-y-6"
              >
                <button onClick={() => setActivePage(currentSubject || 'home')} className="flex items-center gap-2 text-cyber-blue hover:underline">
                  <ChevronLeft size={20} /> Back to Topics
                </button>

                <div className="glass p-8 rounded-3xl space-y-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 bg-cyber-blue transition-all duration-500" style={{ width: quiz ? `${((quizIndex + 1) / quiz.length) * 100}%` : '0%' }} />
                  
                  {quiz ? (
                    quizIndex < quiz.length ? (
                      <>
                        <div className="flex justify-between items-center text-sm font-mono text-white/40">
                          <span>Question {quizIndex + 1} / {quiz.length}</span>
                          <span>Score: {quizScore}</span>
                        </div>
                        
                        <h2 className="text-2xl font-bold leading-relaxed">{quiz[quizIndex].q}</h2>
                        
                        <div className="grid grid-cols-1 gap-4">
                          {quiz[quizIndex].options?.map((opt, i) => (
                            <button 
                              key={i}
                              disabled={!!quizFeedback}
                              onClick={() => handleQuizAnswer(i)}
                              className={cn(
                                "p-4 rounded-xl text-left transition-all duration-200 border border-white/10",
                                quizFeedback ? (
                                  i === quiz[quizIndex].a ? "bg-cyber-green/20 border-cyber-green text-cyber-green" :
                                  "bg-white/5 opacity-50"
                                ) : "bg-white/5 hover:bg-white/10 hover:border-cyber-blue"
                              )}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>

                        {quizFeedback && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center font-bold text-lg"
                          >
                            {quizFeedback}
                          </motion.div>
                        )}
                      </>
                    ) : (
                      <div className="text-center space-y-6 py-10">
                        <div className="text-6xl">🏆</div>
                        <h2 className="text-3xl font-black cyber-text">Quiz Finished!</h2>
                        <p className="text-xl">Final Score: <span className="text-cyber-blue font-bold">{quizScore} / {quiz.length}</span></p>
                        <button 
                          onClick={() => setActivePage(currentSubject || 'home')}
                          className="cyber-button px-8 py-3"
                        >
                          Return to Topics
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <Loader2 className="animate-spin text-cyber-blue" size={40} />
                      <p className="text-white/40 animate-pulse">Gemini is preparing your quiz...</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activePage === 'admin' && (
              <motion.div 
                key="admin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <h1 className="text-4xl font-black cyber-text">Admin Panel</h1>
                  <p className="text-white/40">System management and monitoring</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="glass p-8 rounded-3xl space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold font-orbitron flex items-center gap-2">
                        <UserIcon size={20} className="text-cyber-blue" /> User Management
                      </h2>
                      <button onClick={loadAdminData} className="p-2 hover:bg-white/10 rounded-lg"><Plus size={20} /></button>
                    </div>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                      {allUsers.map(u => (
                        <div key={u.uid} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-3">
                            <img src={u.profilePic || "https://cdn-icons-png.flaticon.com/512/847/847969.png"} className="w-10 h-10 rounded-full" />
                            <div>
                              <p className="font-bold text-sm">{u.username}</p>
                              <span className={cn(
                                "text-[10px] font-bold uppercase",
                                u.status === 'ONLINE' ? "text-cyber-green" : "text-white/30"
                              )}>{u.status}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded uppercase">{u.role}</span>
                            {user.role === 'superadmin' && u.uid !== user.uid && (
                              <button 
                                onClick={() => kickUser(u.uid)}
                                className="p-2 text-cyber-red hover:bg-cyber-red/20 rounded-lg transition-colors"
                              >
                                <ShieldAlert size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass p-8 rounded-3xl space-y-6">
                    <h2 className="text-xl font-bold font-orbitron flex items-center gap-2">
                      <FileText size={20} className="text-cyber-green" /> Activity Logs
                    </h2>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 font-mono text-[10px]">
                      {activityLogs.map(log => (
                        <div key={log.id} className="p-2 bg-white/5 rounded border-l-2 border-cyber-green flex justify-between gap-4">
                          <span className="text-white/40 shrink-0">{log.timestamp?.toDate().toLocaleTimeString()}</span>
                          <span className="font-bold text-cyber-blue shrink-0">{log.username}</span>
                          <span className="flex-1 truncate">{log.action}: {log.details}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Fullscreen Viewer */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black flex items-center justify-center"
          >
            <button 
              onClick={() => setFullscreen(false)}
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full z-[1001]"
            >
              <X size={24} />
            </button>
            
            <img 
              src={viewerImages[currentSlide]} 
              className="max-w-full max-h-full object-contain"
            />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 px-6 py-2 rounded-full font-mono">
              {currentSlide + 1} / {viewerImages.length}
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); setCurrentSlide(prev => (prev - 1 + viewerImages.length) % viewerImages.length); }}
              className="absolute left-6 top-1/2 -translate-y-1/2 p-4 bg-white/5 hover:bg-white/10 rounded-full"
            >
              <ChevronLeft size={32} />
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); setCurrentSlide(prev => (prev + 1) % viewerImages.length); }}
              className="absolute right-6 top-1/2 -translate-y-1/2 p-4 bg-white/5 hover:bg-white/10 rounded-full"
            >
              <ChevronRight size={32} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, collapsed, onClick }) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-4 p-3 rounded-xl transition-all duration-300 relative group",
      active ? "bg-cyber-blue/20 text-cyber-blue shadow-[0_0_10px_rgba(79,209,255,0.3)]" : "hover:bg-white/5 text-white/60 hover:text-white"
    )}
  >
    <div className={cn("shrink-0 transition-transform duration-300", active && "scale-110")}>
      {icon}
    </div>
    {!collapsed && (
      <span className="font-medium text-sm tracking-wide">{label}</span>
    )}
    {collapsed && (
      <div className="absolute left-16 bg-black/80 px-3 py-1 rounded text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {label}
      </div>
    )}
    {active && (
      <motion.div 
        layoutId="active-pill"
        className="absolute left-0 w-1 h-6 bg-cyber-blue rounded-r-full"
      />
    )}
  </button>
);
