// Atlas-Audit: [EXEC-MODE] Verified — Advanced shortcuts open creator-console / audit-logs via coerceActiveMode(..., prev.activeMode).
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Lock, Activity, Zap, Database, Eye, Bell, Monitor, Key, HardDrive, Trash2 } from 'lucide-react';
import { AppState } from '../types';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { cn } from '../lib/utils';

import { useSettingsStore, UITheme, AnimationSpeed, LanguageLevel } from '../services/state/settingsStore';

interface SettingsMenuProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const SettingToggle = ({ label, active, onToggle }: { label: string, active: boolean, onToggle: (v: boolean) => void }) => {
  const [isGlowing, setIsGlowing] = React.useState(false);
  
  const handleToggle = () => {
    onToggle(!active);
    setIsGlowing(true);
    setTimeout(() => setIsGlowing(false), 500);
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-3 bg-obsidian/40 border transition-all duration-300 rounded-sm",
      isGlowing ? "border-gold/50 shadow-[0_0_15px_rgba(176,138,67,0.2)]" : "border-titanium/5"
    )}>
      <span className="text-xs text-stone">{label}</span>
      <button 
        onClick={handleToggle}
        className={cn("w-8 h-4 rounded-full relative transition-colors", active ? "bg-gold/20" : "bg-titanium/20")}
      >
        <div className={cn("absolute top-0.5 w-3 h-3 rounded-full transition-all", active ? "bg-gold right-0.5" : "bg-stone/40 left-0.5")} />
      </button>
    </div>
  );
};

const SettingSelect = ({ label, value, options, onChange }: { label: string, value: string, options: { label: string, value: string }[], onChange: (v: any) => void }) => {
  const [isGlowing, setIsGlowing] = React.useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
    setIsGlowing(true);
    setTimeout(() => setIsGlowing(false), 500);
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-3 bg-obsidian/40 border transition-all duration-300 rounded-sm",
      isGlowing ? "border-gold/50 shadow-[0_0_15px_rgba(176,138,67,0.2)]" : "border-titanium/5"
    )}>
      <span className="text-xs text-stone">{label}</span>
      <select 
        value={value}
        onChange={handleChange}
        className="bg-graphite border border-titanium/20 text-xs text-ivory p-1 rounded-sm outline-none"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
};

export function SettingsMenu({ state, setState }: SettingsMenuProps) {
  const settings = useSettingsStore();
  if (!state.isSettingsOpen) return null;

  const closeSettings = () => setState(prev => ({ ...prev, isSettingsOpen: false }));

  return (
    <AnimatePresence>
      {state.isSettingsOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSettings}
            className="fixed inset-0 bg-obsidian/80 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[85vh] bg-graphite border border-titanium/20 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-titanium/10 bg-obsidian/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gold/10 rounded-sm">
                  <Shield className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <h2 className="text-lg font-serif text-ivory uppercase tracking-widest">Universal Settings</h2>
                  <p className="text-xs text-stone/60 uppercase tracking-widest">System Configuration & Governance</p>
                </div>
              </div>
              <button 
                onClick={closeSettings}
                className="p-2 text-stone/60 hover:text-ivory transition-colors rounded-sm hover:bg-titanium/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Account & Security */}
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-gold uppercase tracking-widest flex items-center gap-2 border-b border-gold/10 pb-2">
                    <Lock size={16} /> Account & Security
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ivory">Current Account</span>
                        <span className="text-xs font-mono text-gold">{state.currentUser?.email || 'Not Signed In'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ivory">Role</span>
                        <span className="text-xs font-mono text-emerald-400">{state.currentUser?.role || 'Guest'}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <SettingToggle label="Advanced Mode" active={settings.isAdvancedMode} onToggle={settings.setAdvancedMode} />
                      <SettingToggle label="Crisis Mode" active={settings.isCrisisMode} onToggle={settings.setCrisisMode} />
                      <div className="p-3 bg-obsidian/40 border border-titanium/5 rounded-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-stone">Precision Level</span>
                          <span className="text-[10px] font-mono text-gold">{settings.precisionLevel.toFixed(1)}</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" max="1" step="0.1" 
                          value={settings.precisionLevel}
                          onChange={(e) => settings.setPrecisionLevel(parseFloat(e.target.value))}
                          className="w-full accent-gold h-1 bg-titanium/20 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <SettingSelect 
                        label="Language Level" 
                        value={settings.languageLevel} 
                        options={[
                          { label: 'Expert', value: 'expert' },
                          { label: 'Intermediate', value: 'intermediate' },
                          { label: 'Basic', value: 'basic' }
                        ]} 
                        onChange={settings.setLanguageLevel} 
                      />
                    </div>
                  </div>
                </div>

                {/* Privacy & Data */}
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-gold uppercase tracking-widest flex items-center gap-2 border-b border-gold/10 pb-2">
                    <Eye size={16} /> Privacy & Data
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <SettingToggle label="Local Encryption" active={settings.isLocalEncryptionEnabled} onToggle={settings.setLocalEncryption} />
                      <SettingToggle label="Telemetry & Analytics" active={settings.isTelemetryEnabled} onToggle={settings.setTelemetry} />
                      <SettingToggle label="Memory Sovereignty Mode" active={settings.isMemorySovereigntyEnabled} onToggle={settings.setMemorySovereignty} />
                      <SettingToggle label="Data Minimization" active={settings.isDataMinimizationEnabled} onToggle={settings.setDataMinimization} />
                    </div>
                    
                    <button className="w-full p-3 flex items-center justify-center gap-2 text-xs text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors rounded-sm">
                      <Trash2 size={14} /> Clear Local Cache
                    </button>
                  </div>
                </div>

                {/* System Preferences */}
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-gold uppercase tracking-widest flex items-center gap-2 border-b border-gold/10 pb-2">
                    <Monitor size={16} /> System Preferences
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <SettingSelect 
                        label="UI Theme" 
                        value={settings.uiTheme} 
                        options={[
                          { label: 'Obsidian (Dark)', value: 'obsidian' },
                          { label: 'Graphite (Dim)', value: 'graphite' }
                        ]} 
                        onChange={settings.setUITheme} 
                      />
                      <SettingSelect 
                        label="Animation Speed" 
                        value={settings.animationSpeed} 
                        options={[
                          { label: 'Normal', value: 'normal' },
                          { label: 'Fast', value: 'fast' },
                          { label: 'Reduced Motion', value: 'reduced' }
                        ]} 
                        onChange={settings.setAnimationSpeed} 
                      />
                      <SettingToggle label="Notifications" active={settings.isNotificationsEnabled} onToggle={settings.setNotifications} />
                    </div>
                  </div>
                </div>

                {/* Advanced / Developer */}
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-gold uppercase tracking-widest flex items-center gap-2 border-b border-gold/10 pb-2">
                    <Zap size={16} /> Advanced
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <button 
                        onClick={() => {
                          setState((prev) => ({
                            ...prev,
                            activeMode: coerceActiveMode('creator-console', prev.activeMode),
                            isSettingsOpen: false,
                          }));
                        }}
                        className="w-full flex items-center justify-between p-3 bg-obsidian/40 border border-titanium/5 rounded-sm hover:border-gold/30 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Key size={14} className="text-stone group-hover:text-gold transition-colors" />
                          <span className="text-xs text-stone group-hover:text-ivory transition-colors">Sovereign Creator Console</span>
                        </div>
                        <span className="text-[10px] text-gold uppercase tracking-widest">Access</span>
                      </button>
                      <button 
                        onClick={() => {
                          setState((prev) => ({
                            ...prev,
                            activeMode: coerceActiveMode('audit-logs', prev.activeMode),
                            isSettingsOpen: false,
                          }));
                        }}
                        className="w-full flex items-center justify-between p-3 bg-obsidian/40 border border-titanium/5 rounded-sm hover:border-gold/30 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Activity size={14} className="text-stone group-hover:text-gold transition-colors" />
                          <span className="text-xs text-stone group-hover:text-ivory transition-colors">System Audit Logs</span>
                        </div>
                        <span className="text-[10px] text-gold uppercase tracking-widest">View</span>
                      </button>
                      <button 
                        className="w-full flex items-center justify-between p-3 bg-obsidian/40 border border-titanium/5 rounded-sm hover:border-gold/30 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <HardDrive size={14} className="text-stone group-hover:text-gold transition-colors" />
                          <span className="text-xs text-stone group-hover:text-ivory transition-colors">Export Memory Vault</span>
                        </div>
                        <span className="text-[10px] text-gold uppercase tracking-widest">Download</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-titanium/10 bg-obsidian/80 flex items-center justify-between">
              <span className="text-[10px] text-stone/40 uppercase tracking-widest font-mono">Obsidian Atlas v1.0.4</span>
              <button 
                onClick={closeSettings}
                className="px-6 py-2 bg-gold text-obsidian text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-ivory transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
