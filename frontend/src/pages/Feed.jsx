import React, { useMemo, useState } from "react";
import { useAppData } from "@/context/AppDataContext";
import { AlertPost } from "@/components/routepulse/AlertPost";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flame, Clock } from "lucide-react";

export default function Feed() {
  const [tab, setTab] = useState("hot");
  const { posts, loading } = useAppData();

  // Each tab actually reorders the feed. "Autour" (distance sort) was dropped
  // because posts don't carry coordinates — an empty decorative tab is worse
  // than no tab.
  const sorted = useMemo(() => {
    const list = [...posts];
    if (tab === "recent") {
      return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    // "hot": most-engaged first.
    return list.sort((a, b) => b.likes + b.confirmed - (a.likes + a.confirmed));
  }, [posts, tab]);

  return (
    <div className="px-4 pt-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Le fil</h1>
        <p className="text-sm text-muted-foreground">Ce que la ville partage en ce moment</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="grid grid-cols-2 w-full bg-muted rounded-xl h-10">
          <TabsTrigger value="hot" className="data-[state=active]:bg-card rounded-lg text-xs gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Tendances
          </TabsTrigger>
          <TabsTrigger value="recent" className="data-[state=active]:bg-card rounded-lg text-xs gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Récents
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-3">
        {loading && <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>}
        {sorted.map((p) => (
          <AlertPost key={p.id} post={p} />
        ))}
      </div>
    </div>
  );
}
