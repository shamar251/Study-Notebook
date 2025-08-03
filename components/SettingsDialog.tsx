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
    if (storedModel) setSelectedModel(storedModel);
    if (storedTemp) setLlmTemperature(Number(storedTemp));
    if (storedTopP) setLlmTopP(Number(storedTopP));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-xl bg-[#f8f5ef] dark:bg-[#232323] border-0 shadow-xl">

        {/* Settings Section */}
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold mb-2">Settings</DialogTitle>
          <DialogDescription className="mb-4 text-base text-muted-foreground">
            Configure your Study Notebook experience
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {/* General Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-base">Dark mode</span>
              <Switch checked={darkMode} onCheckedChange={onToggleDarkMode} />
            </div>
            <div className="text-xs text-muted-foreground">Great for reading at night</div>
          </div>
          {/* LLM Model & Settings Section */}
          <div className="pt-2 border-t border-border">
            <div className="font-semibold text-base mb-2">Local Llama Model</div>
            <div className="flex items-center gap-2 mb-2">
              <select value={selectedModel} onChange={handleModelChange} className="border rounded px-2 py-1 text-sm bg-background">
                <option value="">Select model</option>
                {llmModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">(from Ollama)</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm">
                Temperature
                <input type="number" min="0" max="2" step="0.01" value={llmTemperature} onChange={handleTempChange} className="w-20 border rounded px-2 py-1 bg-background" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                Top P
                <input type="number" min="0" max="1" step="0.01" value={llmTopP} onChange={handleTopPChange} className="w-20 border rounded px-2 py-1 bg-background" />
              </label>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Change your local Llama model and LLM generation settings</div>
          </div>
          {/* Import/Export Section */}
          <div className="pt-2 border-t border-border">
            <div className="font-semibold text-base mb-2">Library</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onImport} className="flex-1">Import</Button>
              <Button variant="outline" onClick={onExport} className="flex-1">Export</Button>
            </div>
          </div>
        </div>
        {/* Account Section */}
        <div className="pt-2 border-t border-border">
          <div className="font-semibold text-base mb-2">Your account</div>
          {user ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">Logged in as <span className="font-medium">{user.email}</span></div>
              <Button size="sm" onClick={handleSignOut}>Log out</Button>
            </div>
          ) : (
            <>
              <div className="text-sm mb-2">You're not logged in right now. An account is only needed for cloud features.</div>
              <form onSubmit={handleAuth} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-48"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-48"
                  required
                />
                <div className="flex gap-2 mt-1 sm:mt-0">
                  <Button
                    type="submit"
                    size="sm"
                    className={authMode === 'signup' ? 'bg-primary text-white' : ''}
                    disabled={loading}
                  >
                    {authMode === 'login' ? 'Log in' : 'Sign up'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={authMode === 'login' ? 'default' : 'outline'}
                    className={authMode === 'login' ? 'bg-primary text-white' : ''}
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  >
                    {authMode === 'login' ? 'Sign up' : 'Log in'}
                  </Button>
                </div>
              </form>
              {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
            </>
          )}
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
} 