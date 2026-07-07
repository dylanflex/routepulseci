import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

// Input with debounced address autocomplete backed by GET /api/geocode/suggest.
// Shared by the "avant de partir" trip planner (Trajet page and the map's
// fullscreen mode) so both stay in sync with a single implementation.
export function PlaceField({ value, onType, onPick, placeholder, dotColor, trailing }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [focused, setFocused] = useState(false);
  const skipRef = useRef(false); // don't re-query right after a pick
  // Per-field query -> results cache. Retyping something already looked up
  // (common with backspace/retype) resolves instantly with no network call.
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!focused) return;
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const key = q.toLowerCase();
    const cached = cacheRef.current.get(key);
    if (cached) {
      setItems(cached);
      setOpen(cached.length > 0);
      return;
    }
    // Abort the previous request (if still in flight) rather than letting it
    // race a newer one: without this, a slower response for an earlier
    // keystroke can resolve after a faster one for a later keystroke and
    // silently overwrite the dropdown with stale suggestions.
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await api.suggestPlaces(q, { signal: controller.signal });
        cacheRef.current.set(key, res);
        setItems(res);
        setOpen(res.length > 0);
      } catch (err) {
        if (err.name !== "AbortError") {
          // Autocomplete is best-effort; a failed lookup shouldn't disrupt typing.
        }
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [value, focused]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/60">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <Input
          value={value}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => { setFocused(false); setOpen(false); }, 150)}
          className="border-0 bg-transparent focus-visible:ring-0 h-8 p-0 text-sm"
          placeholder={placeholder}
        />
        {trailing}
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-elevated overflow-hidden">
          {items.map((it, i) => (
            <button
              key={`${it.name}-${i}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { skipRef.current = true; onPick(it); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PlaceField;
