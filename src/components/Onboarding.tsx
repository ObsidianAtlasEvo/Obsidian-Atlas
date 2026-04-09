import React, { useState } from 'react';
import { Shield, Check, AlertCircle, Lock, Eye, FileText, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConsentState } from '../types';

interface OnboardingProps {
  onComplete: (consent: ConsentState) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  console.log('Onboarding: Rendering...');
  const [step, setStep] = useState(1);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [informedConsent, setInformedConsent] = useState(false);
  const [granularConsents, setGranularConsents] = useState({
    cognitiveSignature: false,
    questionTopology: false,
    relationshipPresence: false,
    identityArc: false,
    covenantMatching: false,
    sharedChambers: false,
    connectors: false,
    crossAccountComparison: false,
    enterpriseGovernance: false,
    modelImprovement: false,
    browserHistory: false,
  });

  const handleComplete = () => {
    if (acceptedTerms && informedConsent) {
      onComplete({
        acceptedTerms,
        informedConsent,
        granularConsents,
      });
    }
  };

  const renderStep1 = () => (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-3xl font-serif text-ivory">Mandatory Terms & Conditions</h2>
        <p className="text-stone opacity-60 leading-relaxed">
          Obsidian Atlas is a private instrument for inquiry, synthesis, and memory. Use is conditioned on acceptance of these non-negotiable terms.
        </p>
      </div>

      <div className="glass-panel p-6 max-h-[400px] overflow-y-auto space-y-6 text-sm text-stone/80">
        <section className="space-y-2">
          <h3 className="text-ivory font-medium">Section 1: Acceptance of Terms</h3>
          <p>By using this software, you affirmatively agree to the Terms of Service, Privacy Policy, and Acceptable Use Policy.</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-ivory font-medium">Section 4: No Professional Advice</h3>
          <p>Obsidian Atlas provides informational and strategic assistance only. It does not provide legal, medical, or financial advice. The user remains solely responsible for all decisions and actions.</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-ivory font-medium">Section 5: User Ownership</h3>
          <p>You retain ownership of your content. Obsidian Atlas holds a limited license to process your data for the purpose of providing the service.</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-ivory font-medium">Section 14: Acceptable Use</h3>
          <p>Prohibited uses include unlawful conduct, harassment, doxxing, and covert profiling of third parties.</p>
        </section>
      </div>

      <div className="flex items-center gap-3 p-4 bg-gold/5 border border-gold/20 rounded">
        <input 
          type="checkbox" 
          id="terms" 
          checked={acceptedTerms} 
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="w-4 h-4 accent-gold"
        />
        <label htmlFor="terms" className="text-sm text-ivory cursor-pointer">
          I affirmatively agree to the Terms of Service and Acceptable Use Policy.
        </label>
      </div>

      <button 
        disabled={!acceptedTerms}
        onClick={() => setStep(2)}
        className="w-full py-4 bg-gold text-charcoal font-medium rounded hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        Continue to Data Consent <ChevronRight size={18} />
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-3xl font-serif text-ivory">Informed Consent to Data Processing</h2>
        <p className="text-stone opacity-60 leading-relaxed">
          To provide a cognitive infrastructure, we must process the data you submit. This includes queries, notes, and documents.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-titanium/10 border border-titanium/20 rounded space-y-2">
          <div className="flex items-center gap-2 text-gold">
            <Lock size={16} />
            <span className="text-xs font-medium uppercase tracking-widest">Sovereignty</span>
          </div>
          <p className="text-xs text-stone">Data is processed for your private workspace. You control deletion and exports.</p>
        </div>
        <div className="p-4 bg-titanium/10 border border-titanium/20 rounded space-y-2">
          <div className="flex items-center gap-2 text-gold">
            <Eye size={16} />
            <span className="text-xs font-medium uppercase tracking-widest">Transparency</span>
          </div>
          <p className="text-xs text-stone">No silent imports or passive scraping without direct user action.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 bg-gold/5 border border-gold/20 rounded">
        <input 
          type="checkbox" 
          id="consent" 
          checked={informedConsent} 
          onChange={(e) => setInformedConsent(e.target.checked)}
          className="w-4 h-4 accent-gold"
        />
        <label htmlFor="consent" className="text-sm text-ivory cursor-pointer">
          I expressly consent to the collection and processing of my data as defined in the Privacy Policy.
        </label>
      </div>

      <button 
        disabled={!informedConsent}
        onClick={() => setStep(3)}
        className="w-full py-4 bg-gold text-charcoal font-medium rounded hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        Configure Intelligence Features <ChevronRight size={18} />
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-serif text-ivory">Granular Feature Opt-In</h2>
          <button 
            onClick={() => {
              const allEnabled = Object.values(granularConsents).every(v => v);
              setGranularConsents(prev => {
                const newState = { ...prev };
                Object.keys(newState).forEach(k => (newState as any)[k] = !allEnabled);
                return newState;
              });
            }}
            className="text-[10px] text-gold hover:text-ivory uppercase tracking-widest font-bold transition-colors"
          >
            {Object.values(granularConsents).every(v => v) ? 'Decline All' : 'Accept All'}
          </button>
        </div>
        <p className="text-stone opacity-60 leading-relaxed">
          Select which high-risk intelligence features you wish to enable. These are disabled by default.
        </p>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {Object.entries(granularConsents).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between p-4 bg-titanium/5 border border-titanium/10 rounded hover:border-gold/30 transition-all">
            <div className="space-y-1">
              <h4 className="text-sm text-ivory capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</h4>
              <p className="text-[10px] text-stone opacity-60">
                {key === 'cognitiveSignature' && 'Models how you think, not just what you save.'}
                {key === 'questionTopology' && 'Analyzes the structure and depth of your inquiries.'}
                {key === 'relationshipPresence' && 'Tracks human dynamics and authority transfer moments.'}
                {key === 'identityArc' && 'Synthesizes your evolving internal narrative.'}
                {key === 'covenantMatching' && 'Finds rare resonance with others based on thought geometry.'}
                {key === 'sharedChambers' && 'Enables collaborative knowledge environments.'}
                {key === 'connectors' && 'Allows ingestion from email, calendar, and cloud storage.'}
                {key === 'crossAccountComparison' && 'Identifies patterns across multiple workspaces.'}
                {key === 'enterpriseGovernance' && 'Enables audit logs and organizational controls.'}
                {key === 'modelImprovement' && 'Uses anonymized data to improve system intelligence.'}
                {key === 'browserHistory' && 'Allows browser history to personalize your homepage.'}
              </p>
            </div>
            <button 
              onClick={() => setGranularConsents(prev => ({ ...prev, [key]: !value }))}
              className={`w-12 h-6 rounded-full transition-all relative ${value ? 'bg-gold' : 'bg-titanium/20'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-charcoal transition-all ${value ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
        ))}
      </div>

      <button 
        onClick={handleComplete}
        className="w-full py-4 bg-gold text-charcoal font-medium rounded hover:bg-gold/90 transition-all flex items-center justify-center gap-2"
      >
        Initialize Obsidian Atlas <Check size={18} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-charcoal z-[100] flex items-center justify-center p-6">
      <div className="atmosphere absolute inset-0 opacity-20" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl glass-panel p-12 relative z-10 space-y-12"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-gold">
            <Shield size={32} />
            <h1 className="text-xl font-mono tracking-[0.3em] uppercase">Onboarding</h1>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className={`w-8 h-1 rounded-full ${step >= i ? 'bg-gold' : 'bg-titanium/20'}`} />
            ))}
          </div>
        </div>

        <div>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        <div className="pt-8 border-t border-titanium/10 flex items-center justify-between text-[10px] text-stone uppercase tracking-widest">
          <span>Obsidian Atlas v2.5</span>
          <span>Sovereign Intelligence Architecture</span>
        </div>
      </motion.div>
    </div>
  );
}
