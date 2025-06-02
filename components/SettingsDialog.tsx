import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabaseClient';

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

  useEffect(() => {
    const session = supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
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