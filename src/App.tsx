import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, updateProfile
} from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit,
  addDoc,
  where,
  Timestamp,
  updateDoc,
  getDocs,
  serverTimestamp,
  getDocFromServer
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
  ShieldAlert,
  Lock,
  Mail,
  ArrowRight,
  Folder,
  Users,
  File,
  ShieldCheck,
  Clock
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
  throw new Error(JSON.stringify(errInfo));
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

const ConfirmModal = ({ message, onConfirm, onCancel }: { message: string, onConfirm: () => void, onCancel: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onClick={onCancel}
  >
    <div className="glass p-8 rounded-3xl text-center max-w-sm w-full mx-4 space-y-6" onClick={e => e.stopPropagation()}>
      <div className="text-4xl flex justify-center text-cyber-red"><ShieldAlert size={48} /></div>
      <p className="text-lg font-bold">{message}</p>
      <div className="flex gap-4">
        <button onClick={onCancel} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-2xl font-bold transition-colors">Cancel</button>
        <button onClick={() => { onConfirm(); onCancel(); }} className="flex-1 bg-cyber-red/20 text-cyber-red hover:bg-cyber-red/30 py-3 rounded-2xl font-bold transition-all border border-cyber-red/30">Confirm</button>
      </div>
    </div>
  </motion.div>
);

// --- Main App ---



export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'verify'>('signin');
  const [activePage, setActivePage] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [popup, setPopup] = useState<{ message: string, icon: React.ReactNode } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string, onConfirm: () => void } | null>(null);
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
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Profile states
  const [myFolders, setMyFolders] = useState<any[]>([]);
  const [myFiles, setMyFiles] = useState<any[]>([]);
  const [myNotes, setMyNotes] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  // Modals
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);

  // Form states
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileFolder, setNewFileFolder] = useState('');
  const [newFileSize, setNewFileSize] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  const currentSessionId = useRef(
    sessionStorage.getItem('app_session_id') || 
    (() => {
      const id = Math.random().toString(36).substring(7);
      sessionStorage.setItem('app_session_id', id);
      return id;
    })()
  ).current;

  const isLoggingIn = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let userDocUnsubscribe: (() => void) | null = null;
    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.uid, "Verified:", firebaseUser?.emailVerified);
      
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
        userDocUnsubscribe = null;
      }

      try {
        if (firebaseUser) {
          // Force reload to get latest emailVerified status
          try {
            await firebaseUser.reload();
          } catch (e) {
            console.error("Error reloading user:", e);
          }
          
          if (!firebaseUser.emailVerified && firebaseUser.email !== 'mjdl05010710@gmail.com') {
            console.log("Email not verified, redirecting to verify screen");
            setUser(null);
            setAuthMode('verify');
            setLoading(false);
            setLoginLoading(false);
            return;
          }

          // Set up real-time listener for the current user's document
          userDocUnsubscribe = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snapshot) => {
            if (snapshot.exists()) {
              const userData = snapshot.data();
              
              // REAL-TIME DELETE/BAN/KICK CHECK
              if (userData.flag === 'BANNED' || userData.flag === 'DELETED') {
                await signOut(auth);
                setUser(null);
                setPopup({ 
                  message: userData.flag === 'BANNED' ? "This account has been banned." : "This account has been deleted.", 
                  icon: <AlertCircle className="text-cyber-red" /> 
                });
                return;
              }

              if (userData.flag === 'KICKED') {
                await handleLogout('kicked');
                return;
              }

              // CONCURRENT SESSION CHECK: If someone else logged in with a different sessionId, log us out.
              // We skip this check if we are currently in the middle of logging in to avoid race conditions.
              if (!isLoggingIn.current && userData.status === 'ONLINE' && userData.sessionId && userData.sessionId !== currentSessionId) {
                console.log("Concurrent session detected. Current:", currentSessionId, "In Firestore:", userData.sessionId);
                await signOut(auth);
                setUser(null);
                setPopup({ 
                  message: "You have been logged out because your account is active in another session.", 
                  icon: <AlertCircle className="text-cyber-red" /> 
                });
                return;
              }

              const newUser: User = {
                uid: firebaseUser.uid,
                username: userData.username || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                role: userData.role || (firebaseUser.email === 'mjdl05010710@gmail.com' ? 'superadmin' : 'user'),
                status: 'ONLINE',
                profilePic: userData.profilePic || firebaseUser.photoURL || undefined,
                flag: userData.flag,
                subjects: userData.subjects,
                sessionId: userData.sessionId
              };
              setUser(newUser);
              
              // Ensure status is ONLINE and sessionId is set in Firestore
              if (userData.status !== 'ONLINE' || userData.sessionId !== currentSessionId) {
                await setDoc(doc(db, 'users', firebaseUser.uid), { 
                  status: 'ONLINE', 
                  sessionId: currentSessionId,
                  lastSeen: serverTimestamp()
                }, { merge: true });
              }
            } else {
              // Create doc if it doesn't exist
              const fallbackData = {
                uid: firebaseUser.uid,
                username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                email: firebaseUser.email,
                role: firebaseUser.email === 'mjdl05010710@gmail.com' ? 'superadmin' : 'user',
                status: 'ONLINE',
                sessionId: currentSessionId,
                createdAt: serverTimestamp(),
                lastSeen: serverTimestamp()
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), fallbackData);
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          });

          setActivePage('home');
        } else {
          console.log("No firebase user, setting user to null");
          setUser(null);
        }
      } catch (error) {
        console.error("Error in onAuthStateChanged:", error);
        setUser(null);
      } finally {
        setLoading(false);
        setLoginLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (userDocUnsubscribe) userDocUnsubscribe();
    };
  }, []);

  // Handle Online/Offline status
  useEffect(() => {
    if (!user) return;

    const setOnline = async () => {
      try {
        await setDoc(doc(db, 'users', user.uid), { status: 'ONLINE', lastSeen: serverTimestamp() }, { merge: true });
      } catch (e) {
        console.error("Error setting online:", e);
      }
    };

    const setOffline = async () => {
      if (auth.currentUser) {
        try {
          await setDoc(doc(db, 'users', user.uid), { status: 'OFFLINE', lastSeen: serverTimestamp() }, { merge: true });
        } catch (e) {
          // Only log if it's not a permission error during logout
          if (!(e instanceof Error && e.message.includes('insufficient permissions'))) {
            console.error("Error setting offline:", e);
          }
        }
      }
    };

    setOnline();
    
    // Heartbeat to keep lastSeen updated every minute
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setOnline();
      }
    }, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setOffline();
      } else {
        setOnline();
      }
    };

    const handleBeforeUnload = () => {
      setOffline();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      setOffline();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user?.uid]);

  // Live Online Users Listener
  useEffect(() => {
    const q = query(collection(db, 'users'), where('status', '==', 'ONLINE'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users: User[] = [];
      snapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...doc.data() } as User);
      });
      setOnlineUsers(users);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
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
            handleLogout('inactivity');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Listen for profile data
      const unsubFolders = onSnapshot(collection(db, `users/${user.uid}/folders`), (snapshot) => {
        setMyFolders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      const unsubFiles = onSnapshot(collection(db, `users/${user.uid}/files`), (snapshot) => {
        setMyFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      const unsubNotes = onSnapshot(collection(db, `users/${user.uid}/notes`), (snapshot) => {
        setMyNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      const unsubMembers = onSnapshot(collection(db, `users/${user.uid}/teamMembers`), (snapshot) => {
        setTeamMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => {
        unsubAnnouncements();
        unsubFolders();
        unsubFiles();
        unsubNotes();
        unsubMembers();
        window.removeEventListener('mousedown', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('touchstart', resetTimer);
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [user]);

  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    setProfileLoading(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/folders`), {
        name: newFolderName.trim(),
        createdAt: serverTimestamp()
      });
      setNewFolderName('');
      setIsFolderModalOpen(false);
    } catch (e) {
      console.error(e);
      setPopup({ message: "Error adding folder", icon: <AlertCircle className="text-cyber-red" /> });
    }
    setProfileLoading(false);
  };

  const handleAddFile = async () => {
    if (!newFileName.trim() || !user) return;
    setProfileLoading(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/files`), {
        name: newFileName.trim(),
        folderId: newFileFolder || null,
        size: newFileSize || '0 KB',
        createdAt: serverTimestamp()
      });
      setNewFileName('');
      setNewFileFolder('');
      setNewFileSize('');
      setIsFileModalOpen(false);
    } catch (e) {
      console.error(e);
      setPopup({ message: "Error adding file", icon: <AlertCircle className="text-cyber-red" /> });
    }
    setProfileLoading(false);
  };

  const handleAddNote = async () => {
    if (!newNoteTitle.trim() || !user) return;
    setProfileLoading(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/notes`), {
        title: newNoteTitle.trim(),
        content: newNoteContent.trim(),
        createdAt: serverTimestamp()
      });
      setNewNoteTitle('');
      setNewNoteContent('');
      setIsNoteModalOpen(false);
    } catch (e) {
      console.error(e);
      setPopup({ message: "Error adding note", icon: <AlertCircle className="text-cyber-red" /> });
    }
    setProfileLoading(false);
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !user) return;
    setProfileLoading(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/teamMembers`), {
        name: newMemberName.trim(),
        role: newMemberRole.trim() || 'Member',
        createdAt: serverTimestamp()
      });
      setNewMemberName('');
      setNewMemberRole('');
      setIsMemberModalOpen(false);
    } catch (e) {
      console.error(e);
      setPopup({ message: "Error adding member", icon: <AlertCircle className="text-cyber-red" /> });
    }
    setProfileLoading(false);
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log("Diagnostic: Testing Firestore connection...");
        const usersRef = collection(db, 'users');
        const q = query(usersRef, limit(1));
        const snap = await getDocs(q);
        console.log("Diagnostic: Firestore connection successful. User count sample:", snap.size);
      } catch (error) {
        console.error("Diagnostic: Firestore connection failed:", error);
      }
    };
    testConnection();
  }, []);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (loginLoading || !trimmedEmail || !trimmedPassword) {
      if (!trimmedEmail) setPopup({ message: "Please enter your username or email", icon: <AlertCircle className="text-cyber-red" /> });
      else if (!trimmedPassword) setPopup({ message: "Please enter your password", icon: <AlertCircle className="text-cyber-red" /> });
      return;
    }
    
    setLoginLoading(true);
    setIsProcessing(true);
    console.log("Attempting login for:", trimmedEmail);
    let loginEmail = trimmedEmail;
    let actualEmail = trimmedEmail;
    let usernameFound = true;
    
    try {
      // If it doesn't look like an email, try to find it as a username in Firestore
      if (!trimmedEmail.includes('@')) {
        console.log("Input is not an email, searching for username in Firestore:", trimmedEmail);
        usernameFound = false;
        const usersRef = collection(db, 'users');
        
        // Try lowercase match first
        const qLower = query(usersRef, where('username_lowercase', '==', trimmedEmail.toLowerCase()));
        const snapLower = await getDocs(qLower);
        
        if (!snapLower.empty) {
          const userDoc = snapLower.docs[0].data();
          loginEmail = userDoc.email;
          actualEmail = userDoc.email;
          usernameFound = true;
          console.log("Found email via lowercase username match:", loginEmail);
        } else {
          // Try exact match fallback
          console.log("No lowercase match, trying exact match for username:", trimmedEmail);
          const qExact = query(usersRef, where('username', '==', trimmedEmail));
          const snapExact = await getDocs(qExact);
          
          if (!snapExact.empty) {
            const userDoc = snapExact.docs[0].data();
            loginEmail = userDoc.email;
            actualEmail = userDoc.email;
            usernameFound = true;
            console.log("Found email via exact username match:", loginEmail);
          } else {
            // STOP: Do not derive email automatically to prevent duplicate accounts
            console.log("No username match found in Firestore for:", trimmedEmail);
            setPopup({ 
              message: `Username "${trimmedEmail}" not found. If you haven't linked your username yet, please log in with your email address first.`, 
              icon: <AlertCircle className="text-cyber-red" /> 
            });
            setLoginLoading(false);
            isLoggingIn.current = false;
            return;
          }
        }
      }

      console.log("Calling Firebase Auth signInWithEmailAndPassword with:", loginEmail);
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, trimmedPassword);
      console.log("Firebase Auth success for UID:", userCredential.user.uid);
      
      // Bypass verification for superadmin
      if (!userCredential.user.emailVerified && userCredential.user.email !== 'mjdl05010710@gmail.com') {
        console.log("Email not verified during login, redirecting to verify screen");
        setVerificationEmail(userCredential.user.email || actualEmail);
        setAuthMode('verify');
        setPopup({ message: "Please verify your email before logging in.", icon: <AlertCircle className="text-cyber-red" /> });
        setLoginLoading(false);
        isLoggingIn.current = false;
        return;
      }
      
      try {
        console.log("Updating user profile in Firestore...");
        const username = userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User';
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          status: 'ONLINE',
          lastLogin: serverTimestamp(),
          lastSeen: serverTimestamp(),
          sessionId: currentSessionId,
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          username: username,
          username_lowercase: username.toLowerCase(),
        }, { merge: true });
        console.log("Firestore profile update successful");
        
        await addDoc(collection(db, 'activity_logs'), {
          timestamp: serverTimestamp(),
          username: username,
          uid: userCredential.user.uid,
          action: 'LOGIN'
        });
      } catch (e) {
        console.error("Firestore update failed during login:", e);
        // We don't block login if activity log fails, but we want to know why
      }
      
      setLoginLoading(false);
      isLoggingIn.current = false;
      setIsProcessing(false);
    } catch (error: any) {
      isLoggingIn.current = false;
      setIsProcessing(false);
      console.error("Login failed with error:", error);
      if (error.code === 'auth/invalid-credential') {
        let message = `Login failed. Please check your credentials.`;
        if (!trimmedEmail.includes('@')) {
          if (!usernameFound) {
            message = `Username "${trimmedEmail}" not found. Please sign up first or check your spelling. If you already have an account, try logging in with your email address once.`;
          } else {
            message = `Incorrect password for username "${trimmedEmail}". If you forgot your password, please use the 'Forgot Password' link.`;
          }
        } else {
          message = `Incorrect email or password. Please try again.`;
        }
        setPopup({ message, icon: <AlertCircle className="text-cyber-red" /> });
      } else if (error.code === 'auth/user-not-found') {
        setPopup({ message: "No account found with this email/username.", icon: <AlertCircle className="text-cyber-red" /> });
      } else if (error.code === 'auth/wrong-password') {
        setPopup({ message: "Incorrect password. Please try again.", icon: <AlertCircle className="text-cyber-red" /> });
      } else {
        setPopup({ message: `Login failed: ${error.message || error.code}`, icon: <AlertCircle className="text-cyber-red" /> });
      }
      setLoginLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        setPopup({ message: "Verification email resent! Please check your inbox.", icon: <CheckCircle2 className="text-cyber-green" /> });
      } catch (e: any) {
        setPopup({ message: `Failed to resend: ${e.message}`, icon: <AlertCircle className="text-cyber-red" /> });
      }
    } else {
      setPopup({ message: "Please sign in first to resend the verification email.", icon: <AlertCircle className="text-cyber-red" /> });
      setAuthMode('signin');
    }
  };

  const checkVerificationStatus = async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          setPopup({ message: "Email verified! You are now logged in.", icon: <CheckCircle2 className="text-cyber-green" /> });
          // The onAuthStateChanged listener will handle the redirection
        } else {
          setPopup({ message: "Email still not verified. Please check your inbox and click the link.", icon: <AlertCircle className="text-cyber-red" /> });
        }
      } catch (e: any) {
        setPopup({ message: `Failed to check status: ${e.message}`, icon: <AlertCircle className="text-cyber-red" /> });
      }
    }
  };

  const handleSignup = async () => {
    if (loginLoading) return;
    
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !trimmedPassword || !trimmedName) {
      if (!trimmedName) setPopup({ message: "Please enter your username", icon: <AlertCircle className="text-cyber-red" /> });
      else if (!trimmedEmail) setPopup({ message: "Please enter your email", icon: <AlertCircle className="text-cyber-red" /> });
      else if (!trimmedPassword) setPopup({ message: "Please enter your password", icon: <AlertCircle className="text-cyber-red" /> });
      return;
    }
    
    setLoginLoading(true);
    isLoggingIn.current = true;
    setIsProcessing(true);
    console.log("Attempting signup for:", trimmedEmail, "with username:", trimmedName);
    try {
      // Check if username is already taken
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username_lowercase', '==', trimmedName.toLowerCase()));
      const usernameSnap = await getDocs(q);
      
      if (!usernameSnap.empty) {
        setPopup({ message: "This username is already taken. Please choose another one.", icon: <AlertCircle className="text-cyber-red" /> });
        setLoginLoading(false);
        return;
      }

      const signupEmail = trimmedEmail.includes('@') ? trimmedEmail : `${trimmedEmail}@gmail.com`;
      const userCredential = await createUserWithEmailAndPassword(auth, signupEmail, trimmedPassword);
      const firebaseUser = userCredential.user;
      console.log("Firebase Auth signup success:", firebaseUser.uid);
      
      await updateProfile(firebaseUser, { displayName: trimmedName });
      
      console.log("Creating user doc in Firestore...");
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        uid: firebaseUser.uid,
        username: trimmedName,
        username_lowercase: trimmedName.toLowerCase(),
        email: firebaseUser.email,
        role: firebaseUser.email === 'mjdl05010710@gmail.com' ? 'superadmin' : 'user',
        status: 'OFFLINE',
        createdAt: serverTimestamp()
      });
      console.log("Firestore user doc created successfully");

      console.log("Sending email verification...");
      await sendEmailVerification(firebaseUser);
      await signOut(auth);
      
      setVerificationEmail(trimmedEmail);
      setAuthMode('verify');
      setPopup({ message: "Account successfully created! Please verify your email.", icon: <CheckCircle2 className="text-cyber-green" /> });
    } catch (error: any) {
      console.error("Signup failed:", error);
      if (error.code === 'auth/email-already-in-use') {
        setPopup({ message: "An account with this email already exists. Please sign in instead.", icon: <AlertCircle className="text-cyber-red" /> });
      } else if (error.code === 'auth/invalid-email') {
        setPopup({ message: "Invalid email address.", icon: <AlertCircle className="text-cyber-red" /> });
      } else if (error.code === 'auth/weak-password') {
        setPopup({ message: "Password is too weak. Please use at least 6 characters.", icon: <AlertCircle className="text-cyber-red" /> });
      } else {
        setPopup({ message: `Signup failed: ${error.message || error.code}`, icon: <AlertCircle className="text-cyber-red" /> });
      }
    } finally {
      setLoginLoading(false);
      isLoggingIn.current = false;
      setIsProcessing(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setPopup({ message: "Please enter your email address first to reset your password.", icon: <AlertCircle className="text-cyber-red" /> });
      return;
    }
    
    setLoginLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setPopup({ message: "Password reset email sent! Please check your inbox.", icon: <CheckCircle2 className="text-cyber-blue" /> });
    } catch (error: any) {
      console.error("Password reset error:", error);
      setPopup({ message: `Failed to send reset email: ${error.message || 'Unknown error'}`, icon: <AlertCircle className="text-cyber-red" /> });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async (reason?: 'kicked' | 'inactivity') => {
    setIsProcessing(true);
    if (user && auth.currentUser) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          status: 'OFFLINE',
          lastLogout: serverTimestamp()
        }, { merge: true });
        
        await addDoc(collection(db, 'activity_logs'), {
          timestamp: serverTimestamp(),
          username: user.username,
          uid: user.uid,
          action: 'LOGOUT',
          details: reason ? `Reason: ${reason}` : 'User manual logout'
        });
      } catch (e) {
        console.error("Error updating status on logout:", e);
      }

      await signOut(auth);
      setUser(null);
      setActivePage('home');
      if (reason === 'kicked') {
        setPopup({ message: "You were kicked by admin", icon: <AlertCircle className="text-cyber-red" /> });
      } else if (reason === 'inactivity') {
        setPopup({ message: "Logged out due to inactivity", icon: <Clock className="text-cyber-blue" /> });
      }
    }
    setIsProcessing(false);
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

  const openReviewer = async (subject: string, type: 'MIDTERM' | 'FINAL') => {
    setCurrentSubject(subject);
    setCurrentTopic(type);
    setActivePage('viewer');
    setViewerImages([]);
    setCurrentSlide(0);
    
    await logActivity('OPEN_REVIEWER', `${subject}_${type}`);

    const folderId = PDF_LINKS[`${subject.toUpperCase()}_${type}`];
    if (!folderId) {
      setPopup({ message: "Reviewer not available yet.", icon: <AlertCircle className="text-cyber-red" /> });
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
        setPopup({ message: "Failed to load images. Check folder permissions.", icon: <AlertCircle className="text-cyber-red" /> });
      }
    } catch (error) {
      console.error("Error fetching images:", error);
      setPopup({ message: "An error occurred while fetching images.", icon: <AlertCircle className="text-cyber-red" /> });
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

  useEffect(() => {
    let unsubUsers: (() => void) | null = null;
    let unsubLogs: (() => void) | null = null;

    if (activePage === 'admin' || activePage === 'manage-admins') {
      if (user?.role === 'admin' || user?.role === 'superadmin') {
        const q = query(collection(db, 'users'));
        unsubUsers = onSnapshot(q, (snapshot) => {
          const users = snapshot.docs
            .map(doc => doc.data() as User)
            .filter(u => u.flag !== 'DELETED');
          setAllUsers(users);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'users');
        });

        const logsQ = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(50));
        unsubLogs = onSnapshot(logsQ, (snapshot) => {
          setActivityLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'activity_logs');
        });
      }
    }

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubLogs) unsubLogs();
    };
  }, [activePage, user?.role]);

  const kickUser = async (targetUid: string) => {
    if (user?.role === 'superadmin') {
      try {
        await setDoc(doc(db, 'users', targetUid), { flag: 'KICKED', status: 'OFFLINE' }, { merge: true });
        setPopup({ message: "User kicked", icon: <CheckCircle2 className="text-cyber-green" /> });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
      }
    }
  };

  const deleteUser = async (targetUid: string) => {
    if (user?.role === 'superadmin' && targetUid !== user.uid) {
      setConfirmModal({
        message: "Are you sure you want to PERMANENTLY disable this user's account? This action cannot be undone.",
        onConfirm: async () => {
          try {
            // Mark as deleted in Firestore instead of full delete to prevent recreation by onAuthStateChanged
            await setDoc(doc(db, 'users', targetUid), { 
              flag: 'DELETED', 
              status: 'OFFLINE',
              deletedAt: serverTimestamp(),
              deletedBy: user.uid
            }, { merge: true });
            
            await addDoc(collection(db, 'activity_logs'), {
              timestamp: serverTimestamp(),
              username: user.username,
              uid: user.uid,
              action: 'DELETE_USER',
              details: `Deleted user UID: ${targetUid}`
            });
            
            setPopup({ message: "User account disabled and data marked for deletion.", icon: <CheckCircle2 className="text-cyber-green" /> });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
          }
        }
      });
    }
  };

  const updateUserRole = async (targetUid: string, newRole: 'user' | 'admin' | 'superadmin') => {
    if (user?.role === 'superadmin') {
      try {
        await setDoc(doc(db, 'users', targetUid), { role: newRole }, { merge: true });
        setPopup({ message: `Role updated to ${newRole}`, icon: <CheckCircle2 className="text-cyber-green" /> });
        
        await addDoc(collection(db, 'activity_logs'), {
          timestamp: serverTimestamp(),
          username: user.username,
          uid: user.uid,
          action: 'UPDATE_ROLE',
          details: `Updated user UID: ${targetUid} to role: ${newRole}`
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
      }
    }
  };

  const updateUsername = async (newName: string) => {
    if (!user || !newName.trim()) return;
    setProfileLoading(true);
    try {
      const trimmedName = newName.trim();
      
      // Check if username is taken
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username_lowercase', '==', trimmedName.toLowerCase()));
      const snap = await getDocs(q);
      
      if (!snap.empty && snap.docs[0].id !== user.uid) {
        setPopup({ message: "Username already taken", icon: <AlertCircle className="text-cyber-red" /> });
        setProfileLoading(false);
        return;
      }

      await setDoc(doc(db, 'users', user.uid), {
        username: trimmedName,
        username_lowercase: trimmedName.toLowerCase()
      }, { merge: true });

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      }

      setUser({ ...user, username: trimmedName });
      setPopup({ message: "Username updated successfully", icon: <CheckCircle2 className="text-cyber-green" /> });
    } catch (e) {
      console.error(e);
      setPopup({ message: "Error updating username", icon: <AlertCircle className="text-cyber-red" /> });
    }
    setProfileLoading(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (loading) return <LoadingScreen />;
  if (isProcessing) return <LoadingScreen message="Processing..." />;

  if (!user) {
    if (authMode === 'verify') {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-10 rounded-3xl text-center w-full max-w-md mx-4"
          >
            <h1 className="text-4xl font-black cyber-text mb-8">Verify Email</h1>
            <div className="mb-8">
              <CheckCircle2 className="w-16 h-16 text-cyber-blue mx-auto mb-4" />
              <p className="text-white/80 text-lg">
                We have sent you a verification email to <span className="font-bold text-cyber-blue">{verificationEmail}</span>. Please verify it and log in.
              </p>
            </div>
            <div className="space-y-4">
              <button 
                onClick={checkVerificationStatus} 
                className="cyber-button w-full py-4 text-lg"
              >
                Check Verification Status
              </button>
              <button 
                onClick={handleResendVerification} 
                className="w-full py-2 text-sm text-white/50 hover:text-white transition-colors"
              >
                Resend Verification Email
              </button>
              <button 
                onClick={() => setAuthMode('signin')} 
                className="w-full py-2 text-sm text-cyber-blue hover:underline"
              >
                Back to Login
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-black overflow-hidden relative">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyber-blue/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyber-purple/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-8 sm:p-10 rounded-3xl text-center w-full max-w-md mx-4 relative z-10"
        >
          <h1 className="text-4xl font-black cyber-text mb-8">Justine & Friends</h1>
          
          <div className="flex gap-4 mb-8">
            <button 
              onClick={() => setAuthMode('signin')}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold transition-all border",
                authMode === 'signin' 
                  ? "bg-cyber-blue/20 border-cyber-blue text-cyber-blue shadow-[0_0_15px_rgba(0,186,255,0.3)]" 
                  : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
              )}
            >
              Sign In
            </button>
            <button 
              onClick={() => setAuthMode('signup')}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold transition-all border",
                authMode === 'signup' 
                  ? "bg-cyber-blue/20 border-cyber-blue text-cyber-blue shadow-[0_0_15px_rgba(0,186,255,0.3)]" 
                  : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
              )}
            >
              Sign Up
            </button>
          </div>

          <div className="space-y-4 mb-8 text-left">
            {authMode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Username</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-cyber-blue transition-colors"
                    placeholder="Enter username"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {authMode === 'signin' ? 'Username or Email' : 'Email Address'}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input 
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-cyber-blue transition-colors"
                  placeholder={authMode === 'signin' ? 'Enter username or email' : 'Enter email'}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-cyber-blue transition-colors"
                  placeholder="Enter password"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <button 
              onClick={authMode === 'signin' ? handleLogin : handleSignup}
              disabled={loginLoading}
              className="cyber-button w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Processing...
                </>
              ) : (
                authMode === 'signin' ? "Sign In" : "Sign Up"
              )}
            </button>
            
            {authMode === 'signin' && (
              <button 
                onClick={handleForgotPassword} 
                disabled={loginLoading || !email}
                className="w-full py-2 text-sm text-white/50 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Forgot Password?
              </button>
            )}
          </div>
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
          <button onClick={() => handleLogout()} className="p-2 bg-cyber-red/20 hover:bg-cyber-red/40 text-cyber-red rounded-lg transition-colors">
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
              {user.role === 'superadmin' && (
                <SidebarItem 
                  icon={<ShieldCheck size={20} />} 
                  label="Manage Admins" 
                  active={activePage === 'manage-admins'} 
                  collapsed={sidebarCollapsed} 
                  onClick={() => setActivePage('manage-admins')} 
                />
              )}
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

            {activePage === 'profile' && (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Profile Header */}
                <div className="glass p-8 rounded-3xl flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-cyber-blue/5 blur-[100px] -mr-32 -mt-32" />
                  
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-4 border-cyber-blue/30 p-1 bg-black/40">
                      <img 
                        src={user.profilePic || "https://cdn-icons-png.flaticon.com/512/847/847969.png"} 
                        alt="Profile" 
                        className="w-full h-full rounded-full object-cover"
                      />
                    </div>
                    <div className="absolute bottom-2 right-2 w-6 h-6 bg-cyber-green rounded-full border-4 border-black shadow-[0_0_10px_#00ffc8]" />
                  </div>

                  <div className="flex-1 text-center md:text-left space-y-4">
                    <div>
                      <h1 className="text-4xl font-black cyber-text leading-none">{user.username}</h1>
                      <p className="text-white/40 mt-1 font-mono text-sm">{auth.currentUser?.email}</p>
                    </div>
                    
                    <div className="flex flex-wrap justify-center md:justify-start gap-3">
                      <div className={cn(
                        "px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2",
                        user.role === 'superadmin' ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/30" :
                        user.role === 'admin' ? "bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/30" : 
                        "bg-white/5 text-white/60 border border-white/10"
                      )}>
                        {user.role === 'superadmin' ? <Crown size={14} /> : <UserIcon size={14} />}
                        {user.role}
                      </div>
                      <div className="px-4 py-1.5 rounded-xl text-xs font-bold bg-cyber-green/10 text-cyber-green border border-cyber-green/20 flex items-center gap-2">
                        <div className="w-2 h-2 bg-cyber-green rounded-full animate-pulse" />
                        Online
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}?user=${user.username}`);
                        setPopup({ message: "Profile link copied to clipboard!", icon: <CheckCircle2 className="text-cyber-green" /> });
                      }}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Copy Profile Link
                    </button>
                    <button className="cyber-button px-6 py-3 text-sm flex items-center justify-center gap-2">
                      <Settings size={18} /> Edit Profile
                    </button>
                  </div>
                </div>

                {/* My Files Section */}
                <div className="glass p-8 rounded-3xl space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <Folder className="text-cyber-blue" size={24} />
                      <h2 className="text-xl font-bold font-orbitron">My Files</h2>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setIsFolderModalOpen(true)} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                        <Plus size={16} /> New Folder
                      </button>
                      <button onClick={() => setIsFileModalOpen(true)} className="cyber-button px-4 py-2 text-sm flex items-center gap-2">
                        <Plus size={16} /> Add File
                      </button>
                    </div>
                  </div>
                  
                  {profileLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-cyber-blue" size={32} /></div>
                  ) : (
                    <div className="space-y-6">
                      {/* Folders */}
                      {myFolders.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {myFolders.map(folder => (
                            <div key={folder.id} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-3 hover:bg-white/10 transition-colors cursor-pointer">
                              <Folder className="text-yellow-400" size={24} />
                              <span className="font-medium truncate">{folder.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Files */}
                      {myFiles.length > 0 ? (
                        <div className="space-y-2">
                          {myFiles.map(file => (
                            <div key={file.id} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors">
                              <div className="flex items-center gap-3">
                                <File className="text-blue-400" size={20} />
                                <div>
                                  <p className="font-medium">{file.name}</p>
                                  <p className="text-xs text-white/40">{file.size} • {file.folderId ? 'In Folder' : 'Root'}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        myFolders.length === 0 && <p className="text-center text-white/40 py-8">No files or folders yet.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Account Settings */}
                <div className="glass p-8 rounded-3xl space-y-6">
                  <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                    <Settings className="text-cyber-green" size={24} />
                    <h2 className="text-xl font-bold font-orbitron">Account Settings</h2>
                  </div>
                  
                  <div className="max-w-md space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-white/40">Change Username</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="New username"
                          defaultValue={user.username}
                          id="new-username-input"
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus:outline-none focus:border-cyber-green transition-colors"
                        />
                        <button 
                          onClick={() => {
                            const input = document.getElementById('new-username-input') as HTMLInputElement;
                            updateUsername(input.value);
                          }}
                          className="bg-cyber-green/20 text-cyber-green hover:bg-cyber-green/30 px-6 py-2 rounded-xl font-bold transition-all border border-cyber-green/30"
                        >
                          Update
                        </button>
                      </div>
                      <p className="text-[10px] text-white/30 italic">Changing your username will update how you appear to others and how you log in.</p>
                    </div>
                  </div>
                </div>

                {/* My Notes Section */}
                <div className="glass p-8 rounded-3xl space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="text-purple-400" size={24} />
                      <h2 className="text-xl font-bold font-orbitron">My Notes</h2>
                    </div>
                    <button onClick={() => setIsNoteModalOpen(true)} className="cyber-button px-4 py-2 text-sm flex items-center gap-2">
                      <Plus size={16} /> New Note
                    </button>
                  </div>
                  
                  {profileLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-cyber-blue" size={32} /></div>
                  ) : myNotes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {myNotes.map(note => (
                        <div key={note.id} className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                          <h3 className="font-bold text-lg mb-2 truncate">{note.title}</h3>
                          <p className="text-sm text-white/60 line-clamp-3">{note.content || 'No content'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-white/40 py-8">No notes yet.</p>
                  )}
                </div>

                {/* Team Members Section */}
                <div className="glass p-8 rounded-3xl space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <Users className="text-green-400" size={24} />
                      <h2 className="text-xl font-bold font-orbitron">Team Members</h2>
                    </div>
                    <button onClick={() => setIsMemberModalOpen(true)} className="cyber-button px-4 py-2 text-sm flex items-center gap-2">
                      <Plus size={16} /> Add Member
                    </button>
                  </div>
                  
                  {profileLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-cyber-blue" size={32} /></div>
                  ) : teamMembers.length > 0 ? (
                    <div className="space-y-2">
                      {teamMembers.map(member => (
                        <div key={member.id} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center font-bold text-lg">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold">{member.name}</p>
                              <p className="text-xs text-white/40">{member.role}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-white/40 py-8">No team members yet.</p>
                  )}
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
                  {Array.from({ length: 8 }, (_, i) => i + 1).map(num => {
                    const topicName = TOPIC_NAMES[activePage.toUpperCase()]?.[num-1] || `Topic ${num}`;
                    const subject = subjects.find(s => s.id === activePage);
                    
                    return (
                      <div key={num} className="glass rounded-2xl overflow-hidden hover:bg-white/10 transition-colors group flex flex-col">
                        <div className="h-24 w-full flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                          <div className="text-4xl opacity-50 group-hover:opacity-100 transition-opacity transform group-hover:scale-110 duration-300">
                            {subject?.icon || <FileText />}
                          </div>
                        </div>
                        <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                          <h3 className="font-bold text-lg leading-tight">{topicName}</h3>
                          <div className="grid grid-cols-2 gap-2 mt-auto">
                            <button 
                              onClick={() => openTopic(activePage, `TOPIC${num}`)}
                              className="bg-white/10 hover:bg-white/20 py-2 rounded-lg text-xs font-bold transition-colors"
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
                      </div>
                    );
                  })}
                  
                  <div className="glass p-6 rounded-2xl space-y-4 border-dashed border-cyber-blue/30">
                    <div className="text-3xl">📖</div>
                    <h3 className="font-bold text-lg">Midterm Reviewer</h3>
                    <button 
                      onClick={() => openReviewer(activePage, 'MIDTERM')}
                      className="cyber-button w-full py-2 text-sm"
                    >
                      Open Reviewer
                    </button>
                  </div>
                  
                  <div className="glass p-6 rounded-2xl space-y-4 border-dashed border-cyber-green/30">
                    <div className="text-3xl">🎯</div>
                    <h3 className="font-bold text-lg">Final Reviewer</h3>
                    <button 
                      onClick={() => openReviewer(activePage, 'FINAL')}
                      className="cyber-button w-full py-2 text-sm"
                    >
                      Open Reviewer
                    </button>
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
                      <p className="text-white/40 animate-pulse">Preparing your assessment...</p>
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="glass p-8 rounded-3xl space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold font-orbitron flex items-center gap-2">
                        <UserIcon size={20} className="text-cyber-blue" /> User Management
                      </h2>
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
                              <div className="flex gap-1">
                                <button 
                                  onClick={() => kickUser(u.uid)}
                                  title="Kick User"
                                  className="p-2 text-cyber-red hover:bg-cyber-red/20 rounded-lg transition-colors"
                                >
                                  <ShieldAlert size={18} />
                                </button>
                                <button 
                                  onClick={() => deleteUser(u.uid)}
                                  title="Delete User"
                                  className="p-2 text-cyber-red hover:bg-cyber-red/20 rounded-lg transition-colors"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass p-8 rounded-3xl space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold font-orbitron flex items-center gap-2">
                        <Users size={20} className="text-cyber-blue" /> Live Online ({onlineUsers.length})
                      </h2>
                    </div>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                      {onlineUsers.length === 0 ? (
                        <p className="text-center text-white/20 py-10">No users online</p>
                      ) : (
                        onlineUsers.map(u => (
                          <div key={u.uid} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                            <div className="relative">
                              <img src={u.profilePic || "https://cdn-icons-png.flaticon.com/512/847/847969.png"} className="w-8 h-8 rounded-full" />
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-cyber-green rounded-full border-2 border-black" />
                            </div>
                            <div>
                              <p className="font-bold text-xs">{u.username}</p>
                              <p className="text-[8px] text-white/40 uppercase tracking-wider">{u.role}</p>
                            </div>
                          </div>
                        ))
                      )}
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

            {activePage === 'manage-admins' && user.role === 'superadmin' && (
              <motion.div 
                key="manage-admins"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <h1 className="text-4xl font-black cyber-text">Manage Admins</h1>
                  <p className="text-white/40">Promote or demote users to administrative roles</p>
                </div>

                <div className="glass p-8 rounded-3xl space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold font-orbitron flex items-center gap-2">
                      <ShieldCheck size={20} className="text-cyber-blue" /> Administrative Roles
                    </h2>
                  </div>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                    {allUsers.map(u => (
                      <div key={u.uid} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center gap-3">
                          <img src={u.profilePic || "https://cdn-icons-png.flaticon.com/512/847/847969.png"} className="w-10 h-10 rounded-full" />
                          <div>
                            <p className="font-bold text-sm">{u.username}</p>
                            <p className="text-[10px] text-white/40">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl border border-white/5">
                            {(['user', 'admin', 'superadmin'] as const).map(role => (
                              <button
                                key={role}
                                onClick={() => updateUserRole(u.uid, role)}
                                disabled={u.uid === user.uid}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all",
                                  u.role === role 
                                    ? "bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/30 shadow-[0_0_10px_rgba(0,186,255,0.2)]" 
                                    : "text-white/30 hover:text-white hover:bg-white/5"
                                )}
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
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

      {/* Modals */}
      <AnimatePresence>
        {isFolderModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass p-6 rounded-3xl w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">New Folder</h3>
              <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder Name" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white mb-6 focus:border-cyber-blue outline-none" autoFocus />
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsFolderModalOpen(false)} className="px-4 py-2 rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
                <button onClick={handleAddFolder} disabled={profileLoading || !newFolderName.trim()} className="cyber-button px-6 py-2 disabled:opacity-50">Create</button>
              </div>
            </motion.div>
          </div>
        )}

        {isFileModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass p-6 rounded-3xl w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Add File</h3>
              <div className="space-y-4 mb-6">
                <input type="text" value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="File Name (e.g., document.pdf)" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyber-blue outline-none" autoFocus />
                <select value={newFileFolder} onChange={e => setNewFileFolder(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyber-blue outline-none appearance-none">
                  <option value="">Root (No Folder)</option>
                  {myFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <input type="text" value={newFileSize} onChange={e => setNewFileSize(e.target.value)} placeholder="Size (e.g., 2.5 MB)" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyber-blue outline-none" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsFileModalOpen(false)} className="px-4 py-2 rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
                <button onClick={handleAddFile} disabled={profileLoading || !newFileName.trim()} className="cyber-button px-6 py-2 disabled:opacity-50">Add</button>
              </div>
            </motion.div>
          </div>
        )}

        {isNoteModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass p-6 rounded-3xl w-full max-w-2xl">
              <h3 className="text-xl font-bold mb-4">New Note</h3>
              <div className="space-y-4 mb-6">
                <input type="text" value={newNoteTitle} onChange={e => setNewNoteTitle(e.target.value)} placeholder="Note Title" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyber-blue outline-none font-bold text-lg" autoFocus />
                <textarea value={newNoteContent} onChange={e => setNewNoteContent(e.target.value)} placeholder="Write your note here..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyber-blue outline-none min-h-[200px] resize-y" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
                <button onClick={handleAddNote} disabled={profileLoading || !newNoteTitle.trim()} className="cyber-button px-6 py-2 disabled:opacity-50">Save</button>
              </div>
            </motion.div>
          </div>
        )}

        {isMemberModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass p-6 rounded-3xl w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Add Team Member</h3>
              <div className="space-y-4 mb-6">
                <input type="text" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Member Name" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyber-blue outline-none" autoFocus />
                <input type="text" value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} placeholder="Role (e.g., Developer, Designer)" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyber-blue outline-none" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsMemberModalOpen(false)} className="px-4 py-2 rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
                <button onClick={handleAddMember} disabled={profileLoading || !newMemberName.trim()} className="cyber-button px-6 py-2 disabled:opacity-50">Add</button>
              </div>
            </motion.div>
          </div>
        )}

        {confirmModal && (
          <ConfirmModal 
            message={confirmModal.message} 
            onConfirm={confirmModal.onConfirm} 
            onCancel={() => setConfirmModal(null)} 
          />
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
