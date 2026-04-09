import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, ArrowUp, Share2, MoreHorizontal, Users, Zap } from 'lucide-react';
import { AppState, SalonThread, SalonPost } from '../types';

interface SalonViewProps {
  state: AppState;
}

export const SalonView: React.FC<SalonViewProps> = ({ state }) => {
  const [selectedThread, setSelectedThread] = useState<SalonThread | null>(null);

  const renderPost = (post: SalonPost, depth = 0) => (
    <motion.div
      key={post.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative pl-6 border-l border-titanium/30 mb-8 ${depth > 0 ? 'mt-4' : ''}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-titanium/50 border border-gold/20 flex items-center justify-center text-[10px] font-mono text-gold">
          {post.author.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-serif text-sm text-ivory">{post.author.name}</span>
            <span className="instrument-label opacity-60">{post.author.role}</span>
            <span className="text-[10px] text-stone font-mono">{post.timestamp}</span>
          </div>
          <p className="editorial-body mb-4">{post.content}</p>
          <div className="flex items-center gap-6">
            <button className="flex items-center gap-2 text-stone hover:text-gold transition-colors group">
              <ArrowUp className="w-3 h-3 group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-[10px] font-mono">{post.upvotes}</span>
            </button>
            <button className="text-[10px] font-mono text-stone hover:text-ivory transition-colors uppercase tracking-wider">
              Reply
            </button>
            <button className="text-stone hover:text-ivory transition-colors">
              <Share2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      {post.replies.map(reply => renderPost(reply, depth + 1))}
    </motion.div>
  );

  return (
    <div className="h-full flex flex-col obsidian-surface overflow-hidden">
      <header className="p-8 border-b border-titanium/20 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-ivory mb-1">The Salon</h1>
          <p className="instrument-label">Collective Intelligence & Dialectic Exchange</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-titanium/20 border border-titanium/50 rounded-full">
            <Users className="w-4 h-4 text-gold" />
            <span className="text-xs font-mono text-stone">1.2k Active</span>
          </div>
          <button className="px-6 py-2 bg-gold/10 border border-gold/30 text-gold text-xs font-mono uppercase tracking-widest hover:bg-gold/20 transition-all">
            Initiate Thread
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Thread List */}
        <div className="w-1/3 border-right border-titanium/20 overflow-y-auto custom-scrollbar p-6">
          <div className="space-y-4">
            {state.salons.map(thread => (
              <motion.div
                key={thread.id}
                whileHover={{ x: 4 }}
                onClick={() => setSelectedThread(thread)}
                className={`p-5 cursor-pointer transition-all border ${
                  selectedThread?.id === thread.id 
                    ? 'bg-gold/5 border-gold/30 gold-glow' 
                    : 'bg-titanium/10 border-titanium/30 hover:border-gold/20'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="instrument-label text-gold/60">{thread.topic}</span>
                  <div className="flex items-center gap-2">
                    <Zap className={`w-3 h-3 ${thread.tension > 70 ? 'text-amber' : 'text-stone'}`} />
                    <span className="text-[10px] font-mono text-stone">{thread.tension}% Tension</span>
                  </div>
                </div>
                <h3 className="text-lg font-serif text-ivory mb-3 leading-tight">{thread.title}</h3>
                <div className="flex items-center gap-4 text-[10px] font-mono text-stone">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {thread.participants}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> {thread.posts.length}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Thread Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-obsidian/50">
          <AnimatePresence mode="wait">
            {selectedThread ? (
              <motion.div
                key={selectedThread.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-12 max-w-4xl mx-auto"
              >
                <div className="mb-12">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="instrument-label text-gold">{selectedThread.topic}</span>
                    <span className="w-1 h-1 rounded-full bg-titanium" />
                    <span className="text-[10px] font-mono text-stone uppercase tracking-widest">
                      Thread ID: {selectedThread.id}
                    </span>
                  </div>
                  <h2 className="text-4xl font-serif text-ivory mb-6 leading-tight">
                    {selectedThread.title}
                  </h2>
                  <div className="flex items-center gap-8 border-y border-titanium/20 py-4">
                    <div className="flex flex-col">
                      <span className="instrument-label opacity-50">Participants</span>
                      <span className="text-sm font-mono text-ivory">{selectedThread.participants}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="instrument-label opacity-50">Dialectic Tension</span>
                      <span className="text-sm font-mono text-ivory">{selectedThread.tension}%</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="instrument-label opacity-50">Status</span>
                      <span className="text-sm font-mono text-teal">Active Exchange</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  {selectedThread.posts.map(post => renderPost(post))}
                </div>

                <div className="mt-16 pt-8 border-t border-titanium/20">
                  <div className="glass-panel p-6">
                    <textarea 
                      placeholder="Contribute to the dialectic..."
                      className="w-full bg-transparent border-none outline-none text-ivory placeholder:text-stone/40 font-sans text-sm resize-none h-32"
                    />
                    <div className="flex justify-end mt-4">
                      <button className="px-8 py-2 bg-gold text-obsidian text-[10px] font-mono font-bold uppercase tracking-[0.2em] hover:bg-ivory transition-colors">
                        Post Contribution
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12">
                <div className="w-24 h-24 rounded-full border border-titanium/30 flex items-center justify-center mb-8 animate-pulse-subtle">
                  <MessageSquare className="w-8 h-8 text-titanium" />
                </div>
                <h2 className="text-2xl font-serif text-ivory/40 mb-4 italic">Select a thread to enter the Salon</h2>
                <p className="instrument-label opacity-30 max-w-xs">
                  Awaiting intellectual resonance. Choose a line of inquiry from the sidebar to begin.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
