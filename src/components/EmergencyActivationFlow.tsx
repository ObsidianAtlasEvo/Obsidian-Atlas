import React, { useState } from 'react';
import { AppState, EmergencyContainment } from '../types';
import { ShieldAlert, ShieldCheck, Lock, Key, Smartphone, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { atlasApiUrl } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';

interface EmergencyActivationFlowProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onClose: () => void;
  isLifting?: boolean;
}

export const EmergencyActivationFlow: React.FC<EmergencyActivationFlowProps> = ({
  state,
  setState,
  onClose,
  isLifting = false,
}) => {
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState('');
  const [otp1, setOtp1] = useState('');
  const [otp2, setOtp2] = useState('');
  const [breakGlassSecret, setBreakGlassSecret] = useState('');
  const [reason, setReason] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const creatorEmail = "crowleyrc62@gmail.com";
  const phone1 = "614-735-9118";
  const phone2 = "614-897-8008";

  const handleNext = () => setStep(prev => prev + 1);

  const handleActivate = async () => {
    setIsVerifying(true);
    try {
      const uid = atlasTraceUserId(state);
      const res = await fetch(atlasApiUrl('/v1/governance/emergency'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          action: isLifting ? 'deactivate' : 'activate',
          reason: isLifting ? (state.emergencyStatus?.reason ?? 'recovery') : reason,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }

      const emergencyState: EmergencyContainment = {
        active: !isLifting,
        activatedAt: isLifting ? state.emergencyStatus?.activatedAt : new Date().toISOString(),
        activatedBy: creatorEmail,
        reason: isLifting ? state.emergencyStatus?.reason : reason,
        level: 4,
        liftedAt: isLifting ? new Date().toISOString() : undefined,
        liftedBy: isLifting ? creatorEmail : undefined,
        forensicSnapshot: !isLifting
          ? {
              configState: { activeMode: state.activeMode, uiPosture: state.cognitiveLoad.uiPosture },
              authLogs: [],
              activeSessions: [state.currentUser?.uid || 'unknown'],
              timestamp: new Date().toISOString(),
            }
          : state.emergencyStatus?.forensicSnapshot,
      };

      setState((prev) => ({ ...prev, emergencyStatus: emergencyState }));
      onClose();
    } catch (error) {
      console.error('Failed to update emergency state:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-gold">
              <Lock className="w-5 h-5" />
              <h3 className="text-sm font-serif uppercase tracking-widest">Step 1: Password Re-Verification</h3>
            </div>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">
              Confirm sovereign identity for {creatorEmail}
            </p>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ENTER CREATOR PASSWORD"
              className="w-full bg-obsidian border border-gold/20 p-3 text-ivory font-mono text-xs focus:border-gold/60 outline-none transition-all"
            />
            <button 
              onClick={handleNext}
              disabled={!password}
              className="w-full py-3 bg-gold/10 border border-gold/40 text-gold text-[10px] uppercase tracking-[0.3em] hover:bg-gold/20 disabled:opacity-30 transition-all"
            >
              Verify Identity
            </button>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-gold">
              <Smartphone className="w-5 h-5" />
              <h3 className="text-sm font-serif uppercase tracking-widest">Step 2: Primary OTP Verification</h3>
            </div>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">
              Code sent to {phone1}
            </p>
            <input 
              type="text"
              value={otp1}
              onChange={(e) => setOtp1(e.target.value)}
              placeholder="ENTER 6-DIGIT CODE"
              className="w-full bg-obsidian border border-gold/20 p-3 text-ivory font-mono text-xs focus:border-gold/60 outline-none transition-all"
            />
            <button 
              onClick={handleNext}
              disabled={otp1.length < 6}
              className="w-full py-3 bg-gold/10 border border-gold/40 text-gold text-[10px] uppercase tracking-[0.3em] hover:bg-gold/20 disabled:opacity-30 transition-all"
            >
              Verify Primary Factor
            </button>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-gold">
              <Smartphone className="w-5 h-5" />
              <h3 className="text-sm font-serif uppercase tracking-widest">Step 3: Secondary OTP Verification</h3>
            </div>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">
              Code sent to {phone2}
            </p>
            <input 
              type="text"
              value={otp2}
              onChange={(e) => setOtp2(e.target.value)}
              placeholder="ENTER 6-DIGIT CODE"
              className="w-full bg-obsidian border border-gold/20 p-3 text-ivory font-mono text-xs focus:border-gold/60 outline-none transition-all"
            />
            <button 
              onClick={handleNext}
              disabled={otp2.length < 6}
              className="w-full py-3 bg-gold/10 border border-gold/40 text-gold text-[10px] uppercase tracking-[0.3em] hover:bg-gold/20 disabled:opacity-30 transition-all"
            >
              Verify Secondary Factor
            </button>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-gold">
              <Key className="w-5 h-5" />
              <h3 className="text-sm font-serif uppercase tracking-widest">Step 4: Passkey Verification</h3>
            </div>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">
              Biometric or Hardware Security Key Required
            </p>
            <div className="p-8 border border-gold/10 bg-gold/5 flex flex-col items-center gap-4">
              <Fingerprint className="w-12 h-12 text-gold animate-pulse" />
              <span className="text-[8px] text-gold uppercase tracking-[0.2em]">Awaiting Passkey...</span>
            </div>
            <button 
              onClick={handleNext}
              className="w-full py-3 bg-gold/10 border border-gold/40 text-gold text-[10px] uppercase tracking-[0.3em] hover:bg-gold/20 transition-all"
            >
              Simulate Passkey Success
            </button>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-gold">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-serif uppercase tracking-widest">Step 5: Break-Glass Secret</h3>
            </div>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">
              Enter the high-assurance recovery secret
            </p>
            <input 
              type="password"
              value={breakGlassSecret}
              onChange={(e) => setBreakGlassSecret(e.target.value)}
              placeholder="ENTER BREAK-GLASS SECRET"
              className="w-full bg-obsidian border border-gold/20 p-3 text-ivory font-mono text-xs focus:border-gold/60 outline-none transition-all"
            />
            <button 
              onClick={handleNext}
              disabled={!breakGlassSecret}
              className="w-full py-3 bg-gold/10 border border-gold/40 text-gold text-[10px] uppercase tracking-[0.3em] hover:bg-gold/20 disabled:opacity-30 transition-all"
            >
              Verify Secret
            </button>
          </div>
        );
      case 6:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-gold">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-sm font-serif uppercase tracking-widest">Step 6: Final Confirmation</h3>
            </div>
            <div className="p-4 border border-red-500/20 bg-red-500/5 space-y-3">
              <p className="text-[10px] text-red-400 uppercase tracking-widest leading-relaxed">
                {isLifting 
                  ? "WARNING: LIFTING EMERGENCY FREEZE WILL RESTORE SYSTEM OPERATIONS. ENSURE INTEGRITY IS VERIFIED."
                  : "WARNING: ACTIVATING EMERGENCY FREEZE WILL IMMEDIATELY HALT ALL SYSTEM OPERATIONS, REVOKE SESSIONS, AND LOCK ALL WRITES."}
              </p>
              {!isLifting && (
                <textarea 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="SPECIFY REASON FOR EMERGENCY FREEZE"
                  className="w-full bg-obsidian border border-gold/20 p-3 text-ivory font-mono text-xs focus:border-gold/60 outline-none transition-all h-24 resize-none"
                />
              )}
            </div>
            <button 
              onClick={handleActivate}
              disabled={isVerifying || (!isLifting && !reason)}
              className={`w-full py-4 border text-[12px] uppercase tracking-[0.4em] transition-all ${
                isLifting 
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/20' 
                  : 'bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20'
              }`}
            >
              {isVerifying ? 'PROCESSING...' : (isLifting ? 'LIFT EMERGENCY FREEZE' : 'ACTIVATE HARD FREEZE')}
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/95 backdrop-blur-md p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md obsidian-surface border border-gold/20 p-8 relative overflow-hidden"
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #D4AF37 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        </div>

        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-stone hover:text-ivory transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative z-10">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className={`p-4 rounded-full mb-4 ${isLifting ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              {isLifting ? <ShieldCheck className="w-10 h-10 text-emerald-500" /> : <ShieldAlert className="w-10 h-10 text-red-500" />}
            </div>
            <h2 className="text-xl font-serif uppercase tracking-[0.3em] text-ivory">
              {isLifting ? 'Recovery Protocol' : 'Emergency Protocol'}
            </h2>
            <div className="h-px w-24 bg-gold/20 my-4" />
            <p className="text-[10px] text-stone uppercase tracking-widest">
              Sovereign Creator Authorization Required
            </p>
          </div>

          {renderStep()}

          <div className="mt-8 flex justify-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div 
                key={i}
                className={`h-1 w-8 transition-all duration-500 ${
                  i === step ? 'bg-gold' : i < step ? 'bg-gold/40' : 'bg-gold/10'
                }`}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

function Fingerprint(props: any) {
  return (
    <svg 
      {...props} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12" />
      <path d="M5 12C5 8.13401 8.13401 5 12 5C15.866 5 19 8.13401 19 12" />
      <path d="M8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12" />
      <path d="M12 11V13" />
      <path d="M12 17V19" />
      <path d="M12 22V22.01" />
      <path d="M11 14H13" />
      <path d="M11 20H13" />
    </svg>
  );
}
