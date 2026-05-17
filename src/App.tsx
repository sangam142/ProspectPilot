import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  MapPin, 
  Building2, 
  Mail, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Copy, 
  RefreshCcw,
  Zap,
  Target,
  FileText,
  Eye
} from "lucide-react";
import axios from "axios";
import { US_CHANNELS } from "./data/cities";
import { Lead } from "./types";

interface LeadCardProps {
  lead: Lead;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onProcess: () => void;
  isProcessing: boolean;
  onCopy: (t: string) => void;
}

export default function App() {
  const [niche, setNiche] = useState(US_CHANNELS.niches[0]);
  const [city, setCity] = useState(US_CHANNELS.cities[0].name);
  const [state, setState] = useState(US_CHANNELS.cities[0].state);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLeadIndex, setSelectedLeadIndex] = useState<number | null>(null);
  const [currentProcessIndex, setCurrentProcessIndex] = useState(-1);
  const [errorMessage, setErrorMessage] = useState("");

  const activeLead = selectedLeadIndex !== null ? leads[selectedLeadIndex] : null;

  // Update state when city changes
  useEffect(() => {
    const selectedCity = US_CHANNELS.cities.find(c => c.name === city);
    if (selectedCity) setState(selectedCity.state);
  }, [city]);

  const searchLeads = async () => {
    setIsSearching(true);
    setLeads([]);
    setErrorMessage("");
    setCurrentProcessIndex(-1);

    try {
      const response = await axios.post("/api/leads", { niche, city, state });
      const foundLeads = response.data.leads || [];
      const leadsWithStatus = foundLeads.map((l: any) => ({
        ...l,
        status: 'idle',
        email: null,
      }));
      setLeads(leadsWithStatus);
      if (leadsWithStatus.length > 0) setSelectedLeadIndex(0);
      
      if (leadsWithStatus.length === 0) {
        setErrorMessage(response.data.message || "No leads found for this search. Try a different niche or city.");
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || "Failed to fetch leads. Please check your API key.";
      setErrorMessage(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const processAllLeads = async () => {
    for (let i = 0; i < leads.length; i++) {
      if (leads[i].status === 'done') continue;
      await processLead(i);
      // Wait 10 seconds between leads to satisfy free tier rate limits (vision models)
      if (i < leads.length - 1) {
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  };

  const processLead = async (index: number) => {
    setCurrentProcessIndex(index);
    updateLeadStatus(index, 'extracting');

    try {
      // 1. Extract Email
      const emailRes = await axios.post("/api/extract-contact", { website: leads[index].website });
      updateLeadData(index, { email: emailRes.data.email });

      // 2. Audit and Draft
      updateLeadStatus(index, 'processing');
      const processRes = await axios.post("/api/process-lead", { 
        website: leads[index].website, 
        name: leads[index].name,
        foundEmail: emailRes.data.email 
      });

      updateLeadData(index, {
        audit: processRes.data.audit,
        draft: processRes.data.email,
        screenshot: processRes.data.screenshot,
        status: 'done'
      });
    } catch (error: any) {
      const msg = error.response?.data?.error || "Processing failed";
      setLeads(prev => prev.map((l, i) => i === index ? { ...l, status: 'error', error: msg } : l));
    }
  };

  const updateLeadStatus = (index: number, status: Lead['status']) => {
    setLeads(prev => prev.map((l, i) => i === index ? { ...l, status } : l));
  };

  const updateLeadData = (index: number, data: Partial<Lead>) => {
    setLeads(prev => prev.map((l, i) => i === index ? { ...l, ...data } : l));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* Top Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white italic">ProspectPilot</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <div className={`w-2 h-2 rounded-full ${isSearching || currentProcessIndex !== -1 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
            {isSearching || currentProcessIndex !== -1 ? 'Processing Leads' : 'System Ready'}
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
            <span className="text-[10px] font-bold text-slate-500">AP</span>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Filters */}
        <aside className="w-72 border-r border-slate-800 bg-slate-900/30 p-6 flex flex-col gap-6 overflow-y-auto">
          <div className="space-y-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Prospecting Engine</label>
            
            <div className="space-y-2">
              <label className="block text-sm text-slate-300">Target Niche</label>
              <select 
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {US_CHANNELS.niches.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-slate-300">US City</label>
              <select 
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {US_CHANNELS.cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-slate-500">State (Auto-mapped)</label>
              <input 
                type="text" 
                value={state}
                readOnly 
                className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed" 
              />
            </div>
          </div>

          <button 
            onClick={searchLeads}
            disabled={isSearching}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-2"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Scrape & Audit
          </button>

          {leads.length > 0 && (
            <button 
              onClick={processAllLeads}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl border border-slate-700/50 transition-all text-xs"
            >
              Process All AI Audits
            </button>
          )}

          {currentProcessIndex !== -1 && (
            <div className="mt-auto p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Pipeline Progress</span>
                <span className="text-[10px] text-indigo-400 font-mono">
                  {Math.round(((currentProcessIndex + 1) / leads.length) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentProcessIndex + 1) / leads.length) * 100}%` }}
                  className="h-full bg-indigo-500"
                />
              </div>
              <p className="text-[9px] text-slate-500 mt-2 uppercase tracking-tight truncate italic">
                {leads[currentProcessIndex].status === 'done' ? 'Completed Audit' : 'Extracting & Auditing...'}
              </p>
            </div>
          )}
        </aside>

        {/* Main Dashboard Area */}
        <main className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
          <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">
            
            {/* Leads Feed (List View) */}
            <div className="col-span-4 flex flex-col gap-4 overflow-hidden border-r border-white/5 pr-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-white">Live Leads</h2>
                <span className="text-[10px] font-bold bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20 uppercase tracking-widest leading-none">
                  {leads.length} Found
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pb-6 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {leads.map((lead, idx) => (
                    <LeadCard 
                      key={lead.website + idx} 
                      lead={lead} 
                      index={idx}
                      isSelected={selectedLeadIndex === idx}
                      onClick={() => setSelectedLeadIndex(idx)}
                      isProcessing={currentProcessIndex === idx}
                      onProcess={() => processLead(idx)}
                      onCopy={copyToClipboard}
                    />
                  ))}
                  {leads.length === 0 && !isSearching && !errorMessage && (
                    <div className="py-24 text-center">
                      <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                        <Target className="w-6 h-6 text-slate-600" />
                      </div>
                      <p className="text-slate-500 text-xs font-medium">No leads loaded.<br/>Use the sidebar to search.</p>
                    </div>
                  )}
                  {isSearching && (
                    <div className="py-12 space-y-4">
                      {[1,2,3].map(i => (
                        <div key={i} className="h-24 bg-slate-900/50 rounded-xl animate-pulse border border-white/5" />
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Detailed View / Tabs */}
            <div className="col-span-8 flex flex-col h-full bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl relative">
              {activeLead ? (
                <DetailView 
                  lead={activeLead} 
                  isProcessing={currentProcessIndex === (selectedLeadIndex)} 
                  onCopy={copyToClipboard}
                  onProcess={() => selectedLeadIndex !== null && processLead(selectedLeadIndex)}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                  <div className="mb-6 opacity-20">
                    <Building2 className="w-24 h-24" />
                  </div>
                  <p className="text-sm uppercase tracking-widest font-medium">Select a lead to view AI audit</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const LeadCard: React.FC<LeadCardProps> = ({ lead, index, isProcessing, onCopy, isSelected, onClick }) => {
  const getScoreColor = (score: number) => {
    if (score > 75) return 'text-emerald-400';
    if (score > 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getScoreLabel = (score: number) => {
    if (score > 75) return 'Healthy';
    if (score > 50) return 'Warning';
    return 'Critical';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-all border group ${
        isSelected 
          ? 'bg-slate-800/80 border-indigo-500/30 shadow-lg ring-1 ring-indigo-500/10' 
          : 'bg-slate-900/40 border-transparent hover:bg-slate-800/40 hover:border-white/5'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="overflow-hidden">
          <h3 className={`font-semibold text-sm truncate transition-colors ${isSelected ? 'text-white' : 'text-slate-300'}`}>
            {lead.name}
          </h3>
          <p className="text-[10px] text-slate-500 truncate font-mono">{new URL(lead.website).hostname}</p>
        </div>
        {lead.status === 'done' && lead.audit && (
          <div className="flex flex-col items-end shrink-0">
            <span className={`text-sm font-black ${getScoreColor(lead.audit.score)}`}>{lead.audit.score}</span>
            <span className={`text-[8px] uppercase font-bold ${getScoreColor(lead.audit.score)} opacity-60 tracking-tighter`}>
              {getScoreLabel(lead.audit.score)}
            </span>
          </div>
        )}
        {isProcessing && (
          <div className="shrink-0">
            <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
          </div>
        )}
        {lead.status === 'error' && (
          <div className="shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
        )}
      </div>
      
      {lead.email && (
        <div className="mt-3 flex items-center justify-between text-[10px]">
          <span className="text-emerald-400/80 flex items-center gap-1 font-medium italic overflow-hidden">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{lead.email}</span>
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); lead.email && onCopy(lead.email); }}
            className="px-2 py-0.5 bg-slate-700/50 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            Copy
          </button>
        </div>
      )}
    </motion.div>
  );
};

const DetailView: React.FC<{ 
  lead: Lead, 
  isProcessing: boolean, 
  onCopy: (t: string) => void,
  onProcess: () => void
}> = ({ lead, isProcessing, onCopy, onProcess }) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'email'>('audit');
  const [manualEmail, setManualEmail] = useState(lead.email || "");

  useEffect(() => {
    if (lead.email && !manualEmail) setManualEmail(lead.email);
  }, [lead.email]);

  const getScoreColor = (score: number) => {
    if (score > 75) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (score > 50) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Detail Header / Tabs */}
      <div className="flex items-center justify-between border-b border-white/5 bg-slate-900/50">
        <div className="flex">
          <button 
            onClick={() => setActiveTab('audit')}
            className={`px-8 py-5 text-xs font-bold uppercase tracking-widest transition-all relative ${
              activeTab === 'audit' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            AI Audit Detail
            {activeTab === 'audit' && (
              <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('email')}
            className={`px-8 py-5 text-xs font-bold uppercase tracking-widest transition-all relative ${
              activeTab === 'email' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Generated Outreach
            {activeTab === 'email' && (
              <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
            )}
          </button>
        </div>
        <div className="pr-6 flex items-center gap-4">
          {lead.status === 'done' && lead.audit && (
             <div className={`px-4 py-1 rounded-full border text-sm font-black flex items-center gap-2 ${getScoreColor(lead.audit.score)}`}>
               {lead.audit.score}
               <span className="text-[10px] uppercase opacity-70">Audit Score</span>
             </div>
          )}
          <a href={lead.website} target="_blank" rel="noopener" className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-all border border-white/5">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="flex-1 p-8 space-y-8 overflow-y-auto custom-scrollbar">
        {lead.status === 'done' ? (
          <AnimatePresence mode="wait">
            {activeTab === 'audit' ? (
              <motion.div 
                key="audit-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Screenshot Area */}
                <div className="relative aspect-video bg-slate-800 rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
                  {lead.screenshot && (
                    <>
                      <img src={lead.screenshot} alt="Visual Audit" className="w-full h-full object-cover object-top" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                      <div className="absolute bottom-4 left-4 flex items-center gap-2">
                         <div className="text-[10px] bg-indigo-600 text-white px-3 py-1 rounded-full uppercase tracking-widest font-black shadow-lg">
                           Visual Screenshot Analyzed
                         </div>
                      </div>
                    </>
                  )}
                </div>

                {/* AI Insights */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                       <AlertCircle className="w-4 h-4" /> Conversion Blockers
                    </h4>
                    <div className="space-y-3">
                      {lead.audit?.findings.map((f, i) => (
                        <div key={i} className="p-4 bg-slate-900 border border-white/5 rounded-xl text-sm text-slate-300 leading-relaxed">
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="p-5 bg-slate-800/40 rounded-2xl border border-white/5">
                      <span className="block text-[10px] text-indigo-400 uppercase font-black tracking-widest mb-3">AI Deep Dive</span>
                      <p className="text-xs text-slate-400 leading-relaxed italic">
                        "The analysis suggests a structural misalignment between the hero value proposition and the CTA placement, likely resulting in high bounce rates for mobile users."
                      </p>
                    </div>
                    <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                      <span className="block text-[10px] text-emerald-400 uppercase font-black tracking-widest mb-3">Opportunity Gap</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Implementing a sticky footer CTA could increase conversion rates by up to 22% for local search traffic.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="email-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 max-w-3xl mx-auto"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recipient</label>
                    <div className="relative">
                      <input 
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        className="w-full bg-slate-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                        placeholder="prospect@business.com"
                      />
                      <Mail className="absolute right-4 top-3.5 w-4 h-4 text-slate-600" />
                    </div>
                  </div>

                  <div className="bg-slate-800 border border-indigo-500/20 rounded-2xl overflow-hidden shadow-2xl group">
                    <div className="px-6 py-4 border-b border-white/5 bg-slate-900/40 flex justify-between items-center">
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 font-black uppercase">Subject Line</span>
                        <p className="text-sm text-indigo-400 font-bold">{lead.draft?.subject}</p>
                      </div>
                      <button 
                        onClick={() => onCopy(`Subject: ${lead.draft?.subject}\n\n${lead.draft?.body}`)}
                        className="p-2 bg-indigo-600 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-8">
                      <p className="text-slate-300 whitespace-pre-line leading-relaxed text-sm font-medium">
                        {lead.draft?.body}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-center pt-4">
                     <p className="text-[10px] text-slate-600 italic">"Sent via Animesh @ ProspectPilot AI Engine"</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : lead.status === 'error' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6 border border-rose-500/20">
               <AlertCircle className="w-8 h-8 text-rose-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Audit Failed</h3>
            <p className="text-rose-400 font-medium text-sm mb-6 bg-rose-500/5 px-4 py-2 rounded-lg border border-rose-500/10">
              {lead.error || "Internal Processing Error"}
            </p>
            <button 
              onClick={onProcess}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl border border-white/5 transition-all"
            >
              Retry Audit
            </button>
          </div>
        ) : isProcessing ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="relative mb-8">
               <div className="w-20 h-20 border-2 border-indigo-500/20 rounded-full animate-ping absolute inset-0" />
               <div className="w-20 h-20 border-2 border-indigo-500 rounded-full flex items-center justify-center bg-slate-900 relative">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
               </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Analyzing {lead.name}</h3>
            <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6 italic">
              {lead.status === 'extracting' ? 'Extracting private emails and social handles...' : 'Gemini Vision is auditing visual layout and conversion CTAs...'}
            </p>
            <div className="w-full max-w-xs h-1 bg-slate-800 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ x: '-100%' }}
                 animate={{ x: '100%' }}
                 transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                 className="w-1/3 h-full bg-indigo-500"
               />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
             <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 opacity-40">
                <Building2 className="w-8 h-8 text-slate-400" />
             </div>
             <h3 className="text-slate-300 font-bold mb-2">Lead Ready for Analysis</h3>
             <p className="text-slate-500 text-sm max-w-md mx-auto mb-8">
               We've successfully scraped this business. Click below to start the AI-powered audit and draft your outreach email.
             </p>
             <button 
               onClick={onProcess}
               className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-xl shadow-xl shadow-indigo-900/20 transition-all flex items-center gap-3"
             >
               <RefreshCcw className="w-5 h-5" />
               Run Full AI Diagnostic
             </button>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex justify-between items-center backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Intelligence: <span className="text-slate-300">Gemini Flash 3 Preview</span></span>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Scraper: <span className="text-slate-300 italic">Geoapify V2</span></span>
        </div>
        <div className="flex gap-2">
          {lead.status === 'done' && (
            <>
              <button 
                onClick={onProcess}
                className="px-4 py-2 text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                <RefreshCcw className="w-3 h-3" /> Re-Audit
              </button>
              <button 
                onClick={() => setActiveTab(activeTab === 'audit' ? 'email' : 'audit')}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-indigo-900/30 transition-all"
              >
                {activeTab === 'audit' ? 'Review Email Draft' : 'Back to Audit'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

