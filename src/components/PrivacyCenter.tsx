import React from 'react';
import { Shield, Lock, Eye, FileText, Trash2, Download, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState, ConsentState } from '../types';

interface PrivacyCenterProps {
  state: AppState;
  onUpdateConsent: (consent: ConsentState) => void;
}

export function PrivacyCenter({ state, onUpdateConsent }: PrivacyCenterProps) {
  const handleToggle = (key: keyof ConsentState['granularConsents']) => {
    onUpdateConsent({
      ...state.consent,
      granularConsents: {
        ...state.consent.granularConsents,
        [key]: !state.consent.granularConsents[key],
      },
    });
  };

  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-4">
        <div className="flex items-center gap-3 text-gold">
          <Shield size={24} />
          <h2 className="text-4xl font-serif text-ivory tracking-tight">Privacy & Data Controls</h2>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          Manage your sovereignty. Control which intelligence features are active and how your data is processed.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-6">
            <h3 className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <Lock size={14} /> Granular Feature Opt-In
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(state.consent.granularConsents).map(([key, value]) => (
                <div key={key} className="glass-panel p-6 flex items-center justify-between border-gold/10 group hover:border-gold/30 transition-all">
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
                    onClick={() => handleToggle(key as keyof ConsentState['granularConsents'])}
                    className={`w-12 h-6 rounded-full transition-all relative ${value ? 'bg-gold' : 'bg-titanium/20'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-charcoal transition-all ${value ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <Eye size={14} /> Data Transparency
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-4">
                <div className="flex items-center gap-2 text-gold">
                  <FileText size={16} />
                  <h4 className="text-sm text-ivory">Retention Policy</h4>
                </div>
                <p className="text-xs text-stone leading-relaxed">
                  Active data is retained for the duration of your account. Backups are kept for 30 days. Deletion requests are processed within 72 hours.
                </p>
              </div>
              <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-4">
                <div className="flex items-center gap-2 text-gold">
                  <CheckCircle size={16} />
                  <h4 className="text-sm text-ivory">Compliance Status</h4>
                </div>
                <p className="text-xs text-stone leading-relaxed">
                  Obsidian Atlas adheres to GDPR, CCPA, and the Sovereign Data Protocol. All processing is transparent and user-authorized.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="space-y-6">
            <h3 className="instrument-label text-gold uppercase tracking-[0.2em]">Sovereignty Actions</h3>
            <div className="space-y-4">
              <button className="w-full p-4 bg-titanium/5 border border-titanium/10 rounded hover:border-gold/30 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-3 text-ivory">
                  <Download size={16} className="text-gold" />
                  <span className="text-sm">Export All Data</span>
                </div>
                <span className="text-[10px] text-stone opacity-40">JSON / Markdown</span>
              </button>
              <button className="w-full p-4 bg-titanium/5 border border-titanium/10 rounded hover:border-gold/30 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-3 text-ivory">
                  <Download size={16} className="text-gold" />
                  <span className="text-sm">Export Mind Map</span>
                </div>
                <span className="text-[10px] text-stone opacity-40">D2 / Mermaid</span>
              </button>
              <button className="w-full p-4 bg-oxblood/10 border border-oxblood/20 rounded hover:border-oxblood/40 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-3 text-oxblood">
                  <Trash2 size={16} />
                  <span className="text-sm">Delete Account</span>
                </div>
                <span className="text-[10px] text-oxblood opacity-40">Irreversible</span>
              </button>
            </div>
          </section>

          <section className="p-6 bg-gold/5 border border-gold/20 rounded space-y-4">
            <div className="flex items-center gap-2 text-gold">
              <AlertTriangle size={16} />
              <h4 className="text-sm text-ivory">High-Risk Notice</h4>
            </div>
            <p className="text-xs text-stone leading-relaxed">
              Enabling features like "Cognitive Signature" or "Relationship Presence" allows the system to infer latent traits. Ensure you have the lawful right to process any third-party data you upload.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
