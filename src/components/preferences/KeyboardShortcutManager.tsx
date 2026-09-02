import { useState, useEffect, useCallback, useRef } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KeyboardShortcut {
  id: string;
  action: string;
  shortcut: string;
  enabled: boolean;
}

interface KeyboardShortcutManagerProps {
  onShortcutsChange?: (shortcuts: KeyboardShortcut[]) => void;
}

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { id: "open", action: "Open BetterShot", shortcut: "CommandOrControl+Shift+B", enabled: true },
  { id: "region", action: "Capture Region", shortcut: "CommandOrControl+Shift+2", enabled: true },
  { id: "fullscreen", action: "Capture Screen", shortcut: "CommandOrControl+Shift+F", enabled: false },
  { id: "window", action: "Capture Window", shortcut: "CommandOrControl+Shift+D", enabled: false },
];

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace(/CommandOrControl/g, "⌘")
    .replace(/Command/g, "⌘")
    .replace(/Control/g, "⌃")
    .replace(/Shift/g, "⇧")
    .replace(/Alt/g, "⌥")
    .replace(/Option/g, "⌥")
    .replace(/\+/g, "");
}

// Convert a keyboard event to Tauri shortcut format
function keyEventToShortcut(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  
  // Build modifier string
  if (e.metaKey || e.ctrlKey) {
    parts.push("CommandOrControl");
  }
  if (e.shiftKey) {
    parts.push("Shift");
  }
  if (e.altKey) {
    parts.push("Alt");
  }
  
  // Get the key - ignore modifier-only presses
  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta", "Command"].includes(key)) {
    return null; // Still waiting for the main key
  }
  
  // Need at least one modifier for a valid shortcut
  if (parts.length === 0) {
    return null;
  }
  
  // Convert key to proper format
  let keyName = key.toUpperCase();
  
  // Handle special keys
  if (key === " ") keyName = "Space";
  else if (key === "ArrowUp") keyName = "Up";
  else if (key === "ArrowDown") keyName = "Down";
  else if (key === "ArrowLeft") keyName = "Left";
  else if (key === "ArrowRight") keyName = "Right";
  else if (key === "Escape") keyName = "Escape";
  else if (key === "Enter") keyName = "Enter";
  else if (key === "Tab") keyName = "Tab";
  else if (key === "Backspace") keyName = "Backspace";
  else if (key === "Delete") keyName = "Delete";
  else if (key.length === 1) keyName = key.toUpperCase();
  else if (key.startsWith("F") && !isNaN(parseInt(key.slice(1)))) keyName = key; // F1-F12
  
  parts.push(keyName);
  
  return parts.join("+");
}

export function KeyboardShortcutManager({ onShortcutsChange }: KeyboardShortcutManagerProps) {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordedShortcut, setRecordedShortcut] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const savedRef = useRef<string>(JSON.stringify(DEFAULT_SHORTCUTS));
  const recordingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const loadShortcuts = async () => {
      try {
        const store = await Store.load("settings.json");
        const saved = await store.get<KeyboardShortcut[]>("keyboardShortcuts");
        if (saved && saved.length > 0) {
          const savedIds = new Set(saved.map((s) => s.id));
          const missingDefaults = DEFAULT_SHORTCUTS.filter((d) => !savedIds.has(d.id));
          const mergedShortcuts = [...saved, ...missingDefaults];
          setShortcuts(mergedShortcuts);
          savedRef.current = JSON.stringify(mergedShortcuts);
        } else {
          setShortcuts(DEFAULT_SHORTCUTS);
          savedRef.current = JSON.stringify(DEFAULT_SHORTCUTS);
        }
      } catch (err) {
        console.error("Failed to load shortcuts:", err);
        setShortcuts(DEFAULT_SHORTCUTS);
      }
    };
    loadShortcuts();
  }, []);

  // Persist unsaved changes on unmount or page hide
  useEffect(() => {
    const persist = async () => {
      if (!hasUnsaved) return;
      try {
        const store = await Store.load("settings.json");
        await store.set("keyboardShortcuts", shortcuts);
        await store.save();
        savedRef.current = JSON.stringify(shortcuts);
        setHasUnsaved(false);
        onShortcutsChange?.(shortcuts);
      } catch (err) {
        console.error("Failed to persist shortcuts on exit:", err);
      }
    };
    const onBeforeUnload = () => {
      // Best-effort synchronous persist not possible for async Store; keep handler for browsers
      if (hasUnsaved) persist();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && hasUnsaved) persist();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Persist on unmount (React navigation back to main)
      if (hasUnsaved) {
        // fire-and-forget; parent will re-read on next mount
        void persist();
      }
    };
  }, [hasUnsaved, shortcuts, onShortcutsChange]);

  // Keyboard recording effect
  useEffect(() => {
    if (!isRecording || !editingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        setIsRecording(false);
        setEditingId(null);
        setRecordedShortcut(null);
        return;
      }

      const shortcut = keyEventToShortcut(e);
      if (shortcut) {
        setRecordedShortcut(shortcut);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (recordedShortcut && editingId) {
        const newShortcuts = shortcuts.map((s) =>
          s.id === editingId ? { ...s, shortcut: recordedShortcut } : s
        );
        setShortcuts(newShortcuts);
        setHasUnsaved(true);
        toast.success("Shortcut updated — unsaved changes");
        setIsRecording(false);
        setEditingId(null);
        setRecordedShortcut(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [isRecording, editingId, recordedShortcut, shortcuts, onShortcutsChange]);

  const persistShortcuts = useCallback(async (toSave: KeyboardShortcut[]) => {
    try {
      const store = await Store.load("settings.json");
      await store.set("keyboardShortcuts", toSave);
      await store.save();
      savedRef.current = JSON.stringify(toSave);
      setHasUnsaved(false);
      onShortcutsChange?.(toSave);
      toast.success("Shortcuts saved");
    } catch (err) {
      console.error("Failed to save shortcuts:", err);
      toast.error("Failed to save shortcuts");
    }
  }, [onShortcutsChange]);

  const saveShortcuts = useCallback((newShortcuts: KeyboardShortcut[]) => {
    // Local-only, marks unsaved — actual persist happens on explicit Save or exit
    setShortcuts(newShortcuts);
    setHasUnsaved(JSON.stringify(newShortcuts) !== savedRef.current);
  }, []);

  const handleStartRecording = useCallback((shortcut: KeyboardShortcut) => {
    setEditingId(shortcut.id);
    setRecordedShortcut(null);
    setIsRecording(true);
    // Focus the recording button to capture keyboard events
    setTimeout(() => recordingRef.current?.focus(), 0);
  }, []);

  const handleCancelRecording = useCallback(() => {
    setIsRecording(false);
    setEditingId(null);
    setRecordedShortcut(null);
  }, []);

  const handleToggle = useCallback((id: string) => {
    const newShortcuts = shortcuts.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    saveShortcuts(newShortcuts);
  }, [shortcuts, saveShortcuts]);

  const handleDelete = useCallback((id: string) => {
    const newShortcuts = shortcuts.filter((s) => s.id !== id);
    saveShortcuts(newShortcuts);
    toast.success("Shortcut removed — unsaved changes");
  }, [shortcuts, saveShortcuts]);

  const handleAdd = useCallback(() => {
    const newId = `custom-${Date.now()}`;
    const newShortcut: KeyboardShortcut = {
      id: newId,
      action: "New Action",
      shortcut: "CommandOrControl+Shift+5",
      enabled: false,
    };
    const newShortcuts = [...shortcuts, newShortcut];
    saveShortcuts(newShortcuts);
    setTimeout(() => handleStartRecording(newShortcut), 100);
  }, [shortcuts, saveShortcuts, handleStartRecording]);

  const handleSave = useCallback(() => {
    void persistShortcuts(shortcuts);
  }, [shortcuts, persistShortcuts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Keyboard Shortcuts</label>
          {hasUnsaved && (
            <span
              data-testid="unsaved-indicator"
              className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded"
            >
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasUnsaved && (
            <Button type="button" variant="cta" size="lg" onClick={handleSave} data-testid="save-shortcuts">
              Save
            </Button>
          )}
          <Button type="button" variant="cta" size="lg" onClick={handleAdd}>
            <Plus className="size-3 mr-1" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <Card key={shortcut.id} className="bg-secondary border-border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {editingId === shortcut.id && isRecording ? (
                    <div className="flex items-center gap-2">
                      <button
                        ref={recordingRef}
                        className="flex-1 px-2 py-1 bg-card border-2 border-primary rounded text-card-foreground text-sm focus:outline-none animate-pulse text-left"
                        autoFocus
                      >
                        {recordedShortcut ? formatShortcut(recordedShortcut) : "Press shortcut..."}
                      </button>
                      <Button
                        variant="cta"
                        size="lg"
                        onClick={handleCancelRecording}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-foreground flex-1">{shortcut.action}</span>
                      <button
                        onClick={() => handleStartRecording(shortcut)}
                        className="px-2 py-1 bg-card border border-border rounded text-foreground font-mono text-xs tabular-nums hover:bg-secondary hover:border-ring transition-colors"
                        title="Click to record new shortcut"
                      >
                        {formatShortcut(shortcut.shortcut)}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggle(shortcut.id)}
                    className={cn(
                      "text-xs",
                      shortcut.enabled
                        ? "text-green-400 hover:text-green-300"
                        : "text-foreground0 hover:text-muted-foreground"
                    )}
                  >
                    {shortcut.enabled ? "Enabled" : "Disabled"}
                  </Button>
                  {shortcut.id.startsWith("custom-") && (
                    <Button
                      variant="cta"
                      size="lg"
                      onClick={() => handleDelete(shortcut.id)}
                      aria-label="Delete shortcut"
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
