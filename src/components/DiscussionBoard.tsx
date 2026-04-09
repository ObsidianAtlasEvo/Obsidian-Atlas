import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, ArrowUp, ArrowDown, Share2, MoreHorizontal } from 'lucide-react';

interface Post {
  id: string;
  author: string;
  title: string;
  content: string;
  upvotes: number;
  comments: number;
  timestamp: string;
  tags: string[];
}

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    author: 'SovereignMind',
    title: 'The Epistemic Risk of LLM Over-reliance',
    content: 'How are we calibrating our confidence when the synthesis engine provides a highly coherent but potentially hallucinated inference? I find that the "Speculation" layer in Atlas is helpful, but we need more robust cross-verification protocols.',
    upvotes: 124,
    comments: 42,
    timestamp: '2h ago',
    tags: ['Epistemology', 'Safety']
  },
  {
    id: '2',
    author: 'CognitiveArchitect',
    title: 'Modeling Intellectual Tensions in Scenario Planning',
    content: 'I\'ve been using the Scenario mode to map out the next 5 years of my career. The "Failure Paths" feature is a game changer for identifying hidden assumptions.',
    upvotes: 89,
    comments: 15,
    timestamp: '5h ago',
    tags: ['Scenarios', 'Strategy']
  }
];

export function DiscussionBoard() {
  const [posts] = useState<Post[]>(MOCK_POSTS);

  return (
    <div className="h-full p-12 overflow-y-auto custom-scrollbar bg-obsidian">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="flex justify-between items-end border-b border-titanium/20 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-gold">
              <MessageSquare size={24} />
              <h1 className="text-4xl font-serif text-ivory">The Salon Board</h1>
            </div>
            <p className="text-stone font-sans opacity-60 tracking-wide">
              Collective intelligence and dialectic inquiry.
            </p>
          </div>
          <button className="px-6 py-2 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 text-[10px] font-mono uppercase tracking-widest transition-all">
            New Inquiry
          </button>
        </header>

        <div className="space-y-6">
          {posts.map((post) => (
            <motion.div 
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-8 border-titanium/20 hover:border-gold/20 transition-all group"
            >
              <div className="flex gap-6">
                <div className="flex flex-col items-center gap-2">
                  <button className="p-1 hover:bg-titanium/20 rounded text-stone hover:text-gold transition-colors">
                    <ArrowUp size={20} />
                  </button>
                  <span className="text-xs font-mono text-ivory font-bold">{post.upvotes}</span>
                  <button className="p-1 hover:bg-titanium/20 rounded text-stone hover:text-oxblood transition-colors">
                    <ArrowDown size={20} />
                  </button>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3 text-[10px] font-mono text-stone opacity-60">
                    <span className="text-gold">u/{post.author}</span>
                    <span>•</span>
                    <span>{post.timestamp}</span>
                    <div className="flex gap-2 ml-auto">
                      {post.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-titanium/10 border border-titanium/20 rounded">#{tag}</span>
                      ))}
                    </div>
                  </div>

                  <h2 className="text-2xl font-serif text-ivory group-hover:text-gold transition-colors leading-tight">
                    {post.title}
                  </h2>
                  
                  <p className="text-sm text-stone leading-relaxed opacity-80">
                    {post.content}
                  </p>

                  <div className="flex items-center gap-6 pt-4 border-t border-titanium/10">
                    <button className="flex items-center gap-2 text-[10px] font-mono text-stone hover:text-ivory transition-colors uppercase tracking-widest">
                      <MessageSquare size={14} />
                      {post.comments} Comments
                    </button>
                    <button className="flex items-center gap-2 text-[10px] font-mono text-stone hover:text-ivory transition-colors uppercase tracking-widest">
                      <Share2 size={14} />
                      Share
                    </button>
                    <button className="ml-auto text-stone hover:text-ivory transition-colors">
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
