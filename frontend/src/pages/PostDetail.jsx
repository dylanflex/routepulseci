import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { AlertPost } from "@/components/routepulse/AlertPost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/time";
import { Heart, Send } from "lucide-react";
import { toast } from "sonner";

export default function PostDetail() {
  const { id } = useParams();
  const { posts, commentsByPost, addComment, fetchComments } = useAppData();
  const { user } = useAuth();
  const post = posts.find((p) => p.id === id) || posts[0];
  const comments = post ? commentsByPost[post.id] || [] : [];
  const [text, setText] = useState("");

  useEffect(() => {
    if (post) fetchComments(post.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  if (!post) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    addComment(post.id, text);
    setText("");
    toast.success("Commentaire publié");
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <AlertPost post={post} />

      <div className="mt-5">
        <h3 className="font-display text-lg font-semibold">{comments.length} commentaires</h3>
        <div className="mt-3 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">{c.avatar}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="bg-muted/60 rounded-2xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm text-foreground">{c.author}</span>
                    <span className="text-[10px] text-muted-foreground">{formatRelativeTime(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{c.text}</p>
                </div>
                <div className="flex items-center gap-3 mt-1 pl-3 text-xs text-muted-foreground">
                  <button className="flex items-center gap-1 hover:text-primary">
                    <Heart className="w-3 h-3" /> {c.likes}
                  </button>
                  <button className="hover:text-foreground">Répondre</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      {user ? (
        <form onSubmit={submit} className="fixed bottom-24 inset-x-0 mx-auto max-w-2xl px-4">
          <div className="glass rounded-2xl p-2 flex items-center gap-2 shadow-elevated">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-hero text-primary-foreground text-xs font-semibold">{user.avatar}</AvatarFallback>
            </Avatar>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ajoute un commentaire..."
              className="border-0 bg-transparent focus-visible:ring-0 flex-1 text-sm"
            />
            <Button type="submit" size="icon" className="h-9 w-9 rounded-xl bg-primary" disabled={!text.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      ) : (
        <div className="fixed bottom-24 inset-x-0 mx-auto max-w-2xl px-4">
          <div className="glass rounded-2xl p-3 shadow-elevated text-center text-sm text-muted-foreground">
            <Link to="/login" state={{ from: `/app/feed/${post.id}` }} className="font-semibold text-primary">
              Connecte-toi
            </Link>{" "}
            pour commenter
          </div>
        </div>
      )}
    </div>
  );
}
