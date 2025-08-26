import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabaseClient';

// @ts-ignore
const isElectron = typeof window !== 'undefined' && window?.electronAPI;
const ipcRenderer = isElectron ? window.require?.('electron').ipcRenderer : undefined;

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onImport: () => void;
  onExport: () => void;
}

export default function SettingsDialog({
  open,
  onOpenChange,
  darkMode,
  onToggleDarkMode,
  onImport,
  onExport,
}: SettingsDialogProps) {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ollamaEnabled, setOllamaEnabled] = useState<boolean>(true);
  const [llmModels, setLlmModels] = useState<string[]>([
    'deepseek-llm:7b',
    'deepseek-r1:8b',
    'deepseek-r1:7b',
    'deepseek-llm:latest',
    'nomic-embed-text:latest',
    'qwen2:latest',
    'llama3:latest',
    'llama3.1:latest',
  ]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [llmTemperature, setLlmTemperature] = useState<number>(0.8);
  const [llmTopP, setLlmTopP] = useState<number>(0.9);
  const [hybridJudgingEnabled, setHybridJudgingEnabled] = useState<boolean>(true);
  const [hybridLowThreshold, setHybridLowThreshold] = useState<number>(0.65);
  const [hybridHighThreshold, setHybridHighThreshold] = useState<number>(0.9);
  const [quizLLMChance, setQuizLLMChance] = useState<number>(0.5);
  const [testHybridJudgingEnabled, setTestHybridJudgingEnabled] = useState<boolean>(false);
  const [testHybridLowThreshold, setTestHybridLowThreshold] = useState<number>(0.65);
  const [testHybridHighThreshold, setTestHybridHighThreshold] = useState<number>(0.9);
  const [testLLMChance, setTestLLMChance] = useState<number>(0.5);
  const [activeTab, setActiveTab] = useState<'general' | 'grading'>('general');

  useEffect(() => {
    const session = supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('ollamaEnabled');
    if (stored !== null) setOllamaEnabled(stored === 'true');
  }, []);

  useEffect(() => {
    async function fetchModelsFromOllama() {
      if (ipcRenderer) {
        try {
          const result = await ipcRenderer.invoke('ollama-list');
          if (Array.isArray(result) && result.length > 0) {
            setLlmModels(result);
          }
        } catch (e) {
          // fallback to static list
        }
      }
    }
    fetchModelsFromOllama();
    // Restore settings from localStorage
    const storedModel = localStorage.getItem('llmModel');
    const storedTemp = localStorage.getItem('llmTemperature');
    const storedTopP = localStorage.getItem('llmTopP');
    const storedHybrid = localStorage.getItem('quizHybridJudging');
    const storedLow = localStorage.getItem('quizHybridLow');
    const storedHigh = localStorage.getItem('quizHybridHigh');
    const storedQuizLLMChance = localStorage.getItem('quizLLMChance');
    const storedTestHybrid = localStorage.getItem('testHybridJudging');
    const storedTestLow = localStorage.getItem('testHybridLow');
    const storedTestHigh = localStorage.getItem('testHybridHigh');
    const storedTestLLMChance = localStorage.getItem('testLLMChance');
    if (storedModel) setSelectedModel(storedModel);
    if (storedTemp) setLlmTemperature(Number(storedTemp));
    if (storedTopP) setLlmTopP(Number(storedTopP));
    if (storedHybrid) setHybridJudgingEnabled(storedHybrid === 'true');
    if (storedLow) setHybridLowThreshold(Number(storedLow));
    if (storedHigh) setHybridHighThreshold(Number(storedHigh));
    if (storedQuizLLMChance) setQuizLLMChance(Number(storedQuizLLMChance));
    if (storedTestHybrid) setTestHybridJudgingEnabled(storedTestHybrid === 'true');
    if (storedTestLow) setTestHybridLowThreshold(Number(storedTestLow));
    if (storedTestHigh) setTestHybridHighThreshold(Number(storedTestHigh));
    if (storedTestLLMChance) setTestLLMChance(Number(storedTestLLMChance));
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleToggleOllama = async () => {
    const newValue = !ollamaEnabled;
    setOllamaEnabled(newValue);
    localStorage.setItem('ollamaEnabled', String(newValue));
    // If running in Electron, send IPC to main process
    if (ipcRenderer) {
      await ipcRenderer.invoke('ollama-toggle', newValue);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value);
    localStorage.setItem('llmModel', e.target.value);
  };
  const handleTempChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLlmTemperature(Number(e.target.value));
    localStorage.setItem('llmTemperature', e.target.value);
  };
  const handleTopPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLlmTopP(Number(e.target.value));
    localStorage.setItem('llmTopP', e.target.value);
  };
  const handleHybridToggle = (checked: boolean) => {
    setHybridJudgingEnabled(checked);
    localStorage.setItem('quizHybridJudging', String(checked));
  };
  const handleHybridLowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setHybridLowThreshold(v);
    localStorage.setItem('quizHybridLow', String(v));
  };
  const handleHybridHighChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setHybridHighThreshold(v);
    localStorage.setItem('quizHybridHigh', String(v));
  };
  const handleQuizLLMChanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setQuizLLMChance(v);
    localStorage.setItem('quizLLMChance', String(v));
  };

  const handleTestHybridToggle = (checked: boolean) => {
    setTestHybridJudgingEnabled(checked);
    localStorage.setItem('testHybridJudging', String(checked));
  };
  const handleTestHybridLowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setTestHybridLowThreshold(v);
    localStorage.setItem('testHybridLow', String(v));
  };
  const handleTestHybridHighChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setTestHybridHighThreshold(v);
    localStorage.setItem('testHybridHigh', String(v));
  };
  const handleTestLLMChanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setTestLLMChance(v);
    localStorage.setItem('testLLMChance', String(v));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto hide-scrollbar rounded-xl bg-card text-foreground border border-border shadow-2xl">

        {/* Settings Section */}
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-tight mb-1">Settings</DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted-foreground">
            Configure your Study Notebook experience
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {/* Section Nav */}
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <button
              className={`px-3 py-1 rounded-md text-sm transition-colors ${activeTab === 'general' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              className={`px-3 py-1 rounded-md text-sm transition-colors ${activeTab === 'grading' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
              onClick={() => setActiveTab('grading')}
            >
              Grading
            </button>
          </div>
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">Dark mode</div>
                    <div className="text-xs text-muted-foreground">Great for reading at night</div>
                  </div>
                  <Switch checked={darkMode} onCheckedChange={onToggleDarkMode} />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'general' && (
            <div className="pt-2 border-t border-border">
              <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm">
                <div className="font-medium text-sm mb-2">Local Llama Model</div>
                <div className="flex items-center gap-2 mb-3">
                  <select
                    value={selectedModel}
                    onChange={handleModelChange}
                    className="border border-input rounded-md px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select model</option>
                    {llmModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">(from Ollama)</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-sm">
                    Temperature
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.01"
                      value={llmTemperature}
                      onChange={handleTempChange}
                      className="w-24 border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    Top P
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={llmTopP}
                      onChange={handleTopPChange}
                      className="w-24 border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
                <div className="text-xs text-muted-foreground mt-2">Change your local Llama model and LLM generation settings</div>
              </div>
            </div>
          )}
          {activeTab === 'grading' && (
            <div className="pt-2 border-t border-border space-y-4">
              <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm">
                <div className="font-medium text-sm mb-2">LLM Quiz Grading</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-foreground">Hybrid Judging (Embeddings + LLM)</span>
                  <Switch checked={hybridJudgingEnabled} onCheckedChange={handleHybridToggle} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                  <label className="flex items-center gap-2 text-sm">
                    Low threshold
                    <input type="number" min="0" max="1" step="0.01" value={hybridLowThreshold} onChange={handleHybridLowChange} className="w-24 border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    High threshold
                    <input type="number" min="0" max="1" step="0.01" value={hybridHighThreshold} onChange={handleHybridHighChange} className="w-24 border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <div className="text-xs text-muted-foreground self-center">LLM fallback uses the selected model</div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Quiz Difficulty</span>
                    <span className="text-xs text-muted-foreground">LLM judged chance: {(quizLLMChance * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={quizLLMChance}
                    onChange={handleQuizLLMChanceChange}
                    className="w-full accent-primary"
                  />
                  <div className="text-xs text-muted-foreground mt-1">Higher difficulty increases how often free-text (LLM judged) questions appear.</div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm">
                <div className="font-medium text-sm mb-2">LLM Test Grading</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-foreground">Hybrid Judging (Embeddings + LLM)</span>
                  <Switch checked={testHybridJudgingEnabled} onCheckedChange={handleTestHybridToggle} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                  <label className="flex items-center gap-2 text-sm">
                    Low threshold
                    <input type="number" min="0" max="1" step="0.01" value={testHybridLowThreshold} onChange={handleTestHybridLowChange} className="w-24 border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    High threshold
                    <input type="number" min="0" max="1" step="0.01" value={testHybridHighThreshold} onChange={handleTestHybridHighChange} className="w-24 border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <div className="text-xs text-muted-foreground self-center">LLM fallback uses the selected model</div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Test Difficulty</span>
                    <span className="text-xs text-muted-foreground">LLM judged chance: {(testLLMChance * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={testLLMChance}
                    onChange={handleTestLLMChanceChange}
                    className="w-full accent-primary"
                  />
                  <div className="text-xs text-muted-foreground mt-1">Higher difficulty increases how often free-text (LLM judged) questions appear.</div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'general' && (
            <div className="pt-2 border-t border-border">
              <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm">
                <div className="font-medium text-sm mb-2">Library</div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onImport} className="flex-1">Import</Button>
                  <Button variant="outline" onClick={onExport} className="flex-1">Export</Button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Account Section */}
        <div className="pt-2 border-t border-border">
          <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm">
            <div className="font-medium text-sm mb-2">Your account</div>
            {user ? (
              <div className="flex items-center justify-between">
                <div className="text-sm">Logged in as <span className="font-medium">{user.email}</span></div>
                <Button size="sm" onClick={handleSignOut}>Log out</Button>
              </div>
            ) : (
              <>
                <div className="text-sm mb-2 text-muted-foreground">You're not logged in right now. An account is only needed for cloud features.</div>
                <form onSubmit={handleAuth} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-48"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-48"
                    required
                  />
                  <div className="flex gap-2 mt-1 sm:mt-0">
                    <Button
                      type="submit"
                      size="sm"
                      className={authMode === 'signup' ? 'bg-primary text-primary-foreground' : ''}
                      disabled={loading}
                    >
                      {authMode === 'login' ? 'Log in' : 'Sign up'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={authMode === 'login' ? 'default' : 'outline'}
                      className={authMode === 'login' ? 'bg-primary text-primary-foreground' : ''}
                      onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    >
                      {authMode === 'login' ? 'Sign up' : 'Log in'}
                    </Button>
                  </div>
                </form>
                {error && <div className="text-xs text-destructive mt-1">{error}</div>}
              </>
            )}
          </div>
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
} 