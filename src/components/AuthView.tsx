import React, { useState } from 'react';
import { auth, db, logAudit, markLocalEmailVerified } from '../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AppState, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Mail, ShieldCheck, Smartphone, Key, AlertTriangle, ArrowRight, Github } from 'lucide-react';
import { cn } from '../lib/utils';

interface AuthViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function AuthView({ state, setState }: AuthViewProps) {
  console.log('AuthView: Rendering...');
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 3FA State for Creator
  const [emailSent, setEmailSent] = useState(false);
  
  const show3FA = state.is3FAPending;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (user.email === 'crowleyrc62@gmail.com') {
          // Trigger 3FA for Creator
          setState(prev => ({ ...prev, is3FAPending: true }));
          
          if (!user.emailVerified) {
            await sendEmailVerification(user);
            setEmailSent(true);
            logAudit('Creator Verification Email Sent', 'high', { email: user.email });
          }
          
          setLoading(false);
          logAudit('Creator 3FA Initiated', 'high', { email: user.email });
          return;
        }
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        logAudit('User Signup', 'medium', { email });
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const verify3FA = async () => {
    setLoading(true);
    try {
      await markLocalEmailVerified();
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        logAudit('Creator 3FA Success', 'critical', { email: auth.currentUser?.email });
        setState(prev => ({ ...prev, is3FAPending: false }));
      } else {
        setError('Local verification did not complete. Try again or restart the session.');
        logAudit('Creator 3FA Check - Not Verified', 'medium', { email: auth.currentUser?.email });
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const resendEmail = async () => {
    setLoading(true);
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setEmailSent(true);
        setError(null);
        logAudit('Creator Verification Email Resent', 'medium', { email: auth.currentUser.email });
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (show3FA) {
    return (
      <div className="h-[100dvh] w-full bg-obsidian flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full glass-panel p-10 border-gold/30 bg-gold/5 space-y-8"
        >
          <div className="text-center space-y-2">
            <ShieldCheck size={48} className="text-gold mx-auto" />
            <h2 className="text-2xl font-serif text-ivory tracking-tight">Creator Sovereignty Verification</h2>
            <p className="text-xs text-stone uppercase tracking-widest opacity-60">3-Factor Authentication Required</p>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-gold/5 border border-gold/20 text-center space-y-4">
              <Mail size={32} className="text-gold mx-auto opacity-50" />
              <div className="space-y-2">
                <p className="text-sm text-ivory">A verification link has been sent to</p>
                <p className="text-gold font-mono text-xs">crowleyrc62@gmail.com</p>
              </div>
              <p className="text-[10px] text-stone uppercase tracking-widest leading-relaxed">
                Please click the link in the email to verify your identity and establish your sovereign session.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-oxblood/10 border border-oxblood/20 text-[10px] text-oxblood uppercase tracking-widest text-center">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button 
                onClick={verify3FA}
                disabled={loading}
                className="w-full py-4 bg-gold text-obsidian font-bold uppercase tracking-widest text-xs hover:bg-ivory transition-all disabled:opacity-50"
              >
                {loading ? 'Checking Status...' : 'Verify & Enter Atlas'}
              </button>

              <button 
                onClick={resendEmail}
                disabled={loading}
                className="w-full py-2 text-[10px] text-stone uppercase tracking-widest hover:text-gold transition-all"
              >
                Resend Verification Email
              </button>
            </div>

            <button 
              onClick={() => { signOut(auth); setState(prev => ({ ...prev, is3FAPending: false })); }}
              className="w-full text-[10px] text-stone uppercase tracking-widest hover:text-ivory transition-all pt-4"
            >
              Cancel & Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-obsidian flex items-center justify-center p-6">
      <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gold/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-12 relative z-10"
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border border-gold/40 flex items-center justify-center bg-gold/5 mx-auto mb-8">
            <span className="text-gold font-serif text-2xl font-bold">OA</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-serif text-ivory tracking-tight">
            {isLogin ? 'Welcome Back to Atlas' : 'Initialize Your Atlas'}
          </h1>
          <p className="text-stone text-sm opacity-60 max-w-xs mx-auto leading-relaxed">
            {isLogin 
              ? 'Access your persistent private intelligence environment.' 
              : 'Begin your journey into cognitive sovereignty and architectural excellence.'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-stone/40 group-focus-within:text-gold transition-colors" size={18} />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full bg-titanium/5 border border-titanium/20 p-4 pl-12 text-sm text-ivory focus:border-gold outline-none transition-all placeholder:text-stone/30"
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone/40 group-focus-within:text-gold transition-colors" size={18} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-titanium/5 border border-titanium/20 p-4 pl-12 text-sm text-ivory focus:border-gold outline-none transition-all placeholder:text-stone/30"
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-oxblood/10 border border-oxblood/20 text-xs text-oxblood text-center">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-ivory text-obsidian font-bold uppercase tracking-widest text-xs hover:bg-gold transition-all flex items-center justify-center gap-2 group"
          >
            {loading ? 'Processing...' : (isLogin ? 'Enter Atlas' : 'Create Account')}
            {!loading && <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="space-y-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-titanium/10"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest text-stone bg-obsidian px-4">Or Continue With</div>
          </div>

          <button className="w-full py-3 border border-titanium/20 text-stone hover:text-ivory hover:border-titanium/40 transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-widest">
            <Github size={18} /> Github
          </button>
        </div>

        <div className="text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-[10px] text-stone uppercase tracking-widest hover:text-gold transition-all"
          >
            {isLogin ? "Don't have an account? Initialize" : "Already have an account? Enter"}
          </button>
        </div>

        <div className="text-center flex justify-center gap-4 pt-4 border-t border-titanium/10">
          <a href="https://obsidianatlastech.com/privacy" className="text-[10px] text-stone uppercase tracking-widest hover:text-gold transition-all">
            Privacy Policy
          </a>
          <a href="https://obsidianatlastech.com/terms" className="text-[10px] text-stone uppercase tracking-widest hover:text-gold transition-all">
            Terms & Conditions
          </a>
        </div>
      </motion.div>
    </div>
  );
}
