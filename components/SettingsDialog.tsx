import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-xl bg-[#f8f5ef] dark:bg-[#232323] border-0 shadow-xl">
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
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
} 