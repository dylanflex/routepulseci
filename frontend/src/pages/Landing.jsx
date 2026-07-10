import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TrafficMap } from "@/components/routepulse/LazyTrafficMap";
import { TrafficLegend } from "@/components/routepulse/TrafficLegend";
import { AlertPost } from "@/components/routepulse/AlertPost";
import { StatChip } from "@/components/routepulse/StatChip";
import { useAppData } from "@/context/AppDataContext";

// French-formatted number with a graceful placeholder while stats load.
const fmtStat = (n) => (typeof n === "number" ? n.toLocaleString("fr-FR") : "…");
import {
  ArrowRight, Zap, ShieldCheck, MapPin, Sparkles, TrendingUp, Clock,
  MessageCircleHeart, Layers, LineChart, Menu, X, Bell, Heart,
  Play, Route as RouteIcon,
  Camera, Send, Radio, Activity, Trophy, Medal
} from "lucide-react";
import { useState } from "react";

const Nav = () => {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
        <div className="glass rounded-2xl shadow-soft flex items-center justify-between px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-hero flex items-center justify-center shadow-glow">
              <Activity className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="font-display text-lg font-semibold tracking-tight text-foreground">
              RoutePulse <span className="text-primary">CI</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#fonctionnalites" className="hover:text-foreground transition-colors">Fonctionnalités</a>
            <a href="#communaute" className="hover:text-foreground transition-colors">Communauté</a>
            <a href="#carte" className="hover:text-foreground transition-colors">La carte</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/app" className="hidden sm:block">
              <Button variant="ghost" size="sm" className="rounded-xl">Se connecter</Button>
            </Link>
            <Link to="/app">
              <Button size="sm" className="rounded-xl bg-foreground text-background hover:bg-foreground/90 shadow-soft">
                Ouvrir l&apos;app <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="md:hidden mt-2 glass rounded-2xl p-3 flex flex-col gap-1 text-sm">
            <a href="#fonctionnalites" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg hover:bg-muted">Fonctionnalités</a>
            <a href="#communaute" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg hover:bg-muted">Communauté</a>
            <a href="#carte" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg hover:bg-muted">La carte</a>
            <a href="#faq" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg hover:bg-muted">FAQ</a>
          </div>
        )}
      </div>
    </header>
  );
};

const Hero = () => {
  const { stats } = useAppData();
  return (
  <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
    {/* Background */}
    <div className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-surface" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] -translate-y-1/3 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/15 rounded-full blur-[120px] translate-y-1/3" />
    </div>

    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-12 gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-6"
        >
          <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary px-3 py-1 mb-5">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Alpha · Abidjan · {fmtStat(stats?.contributors)} contributeurs
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] text-foreground">
            La route côte d’Ivoire,
            <span className="block mt-1 bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary-glow to-warning">
              en temps réel.
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
            Signale un embouteillage, un accident, une inondation ou un nid de poule en
            <span className="font-semibold text-foreground"> un clic</span>. Rejoins la première communauté
            citoyenne qui fiabilise l’info route en Afrique de l’Ouest.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/app">
              <Button size="lg" className="rounded-xl bg-gradient-hero text-primary-foreground shadow-glow hover:opacity-95 h-12 px-6">
                Ouvrir la carte <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link to="/app/signaler">
              <Button size="lg" variant="outline" className="rounded-xl h-12 px-6 border-border bg-card">
                <Play className="w-4 h-4 mr-2" /> Voir la démo
              </Button>
            </Link>
          </div>

          {/* trust row — live figures from the API */}
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
            <div>
              <p className="font-display text-2xl font-semibold text-foreground">{fmtStat(stats?.activeAlerts)}</p>
              <p className="text-xs text-muted-foreground">alertes actives</p>
            </div>
            <div>
              <p className="font-display text-2xl font-semibold text-foreground">{fmtStat(stats?.contributors)}</p>
              <p className="text-xs text-muted-foreground">contributeurs</p>
            </div>
            <div>
              <p className="font-display text-2xl font-semibold text-foreground">{fmtStat(stats?.confirmations)}</p>
              <p className="text-xs text-muted-foreground">confirmations</p>
            </div>
          </div>
        </motion.div>

        {/* Hero visual — phone mockup */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="lg:col-span-6 relative"
        >
          <div className="relative mx-auto max-w-md">
            {/* Floating alert bubble left */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="hidden sm:flex absolute -left-8 top-16 z-20 items-center gap-2 bg-card border border-border rounded-2xl shadow-elevated px-3 py-2"
            >
              <div className="w-8 h-8 rounded-xl bg-traffic-blocked/15 flex items-center justify-center">
                <Bell className="w-4 h-4 traffic-blocked" />
              </div>
              <div>
                <p className="text-xs font-semibold">Accident · Bd de France</p>
                <p className="text-[10px] text-muted-foreground">Confirmé par la communauté</p>
              </div>
            </motion.div>

            {/* Floating stat right */}
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="hidden sm:flex absolute -right-6 bottom-24 z-20 items-center gap-2 bg-card border border-border rounded-2xl shadow-elevated px-3 py-2"
            >
              <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-semibold">Zone confirmée</p>
                <p className="text-[10px] text-muted-foreground">Signalements croisés</p>
              </div>
            </motion.div>

            {/* Phone frame */}
            <div className="relative rounded-[2.5rem] p-3 bg-gradient-dark shadow-elevated ring-1 ring-black/10">
              <div className="rounded-[2rem] overflow-hidden bg-background aspect-[9/17] relative">
                {/* status bar */}
                <div className="absolute top-0 inset-x-0 h-6 z-30 flex items-center justify-between px-6 pt-1.5 text-[10px] font-semibold text-foreground">
                  <span>09:41</span>
                  <span className="flex items-center gap-1"><Radio className="w-2.5 h-2.5" /> Live</span>
                </div>
                {/* Map inside phone */}
                <div className="absolute inset-0">
                  <TrafficMap allowFullscreen={false} />
                </div>
                {/* Bottom sheet */}
                <div className="absolute bottom-3 inset-x-3 glass rounded-2xl p-3 shadow-elevated">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-hero flex items-center justify-center">
                      <Zap className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">Bouchon Bd Latrille</p>
                      <p className="text-[10px] text-muted-foreground">+18 min · Déviation proposée</p>
                    </div>
                    <div className="text-[10px] font-medium text-primary">Voir</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
  );
};

const Features = () => {
  const features = [
    { icon: Zap, title: "Signalement en 1 clic", desc: "Géolocalisé automatiquement, sans compte requis. Photo optionnelle. Moins de 3 secondes." },
    { icon: Layers, title: "Fiabilisation par croisement", desc: "N signalements du même type dans un rayon = zone confirmée. On transforme le bruit en signal." },
    { icon: MessageCircleHeart, title: "Réseau citoyen intégré", desc: "Poste, commente, like, partage. Un vrai fil d’alertes animé par ta ville." },
    { icon: RouteIcon, title: "«Avant de partir»", desc: "On scanne ton itinéraire, on te dit ce qui bloque avant que tu prennes le volant." },
    { icon: ShieldCheck, title: "Modération communautaire", desc: "Confirme, contredit, signale. La communauté filtre les fausses alertes en temps réel." },
    { icon: LineChart, title: "Impact mesurable", desc: "Temps gagné, accidents évités, zones critiques. Chaque alerte compte." },
  ];
  return (
    <section id="fonctionnalites" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <Badge variant="outline" className="rounded-full border-accent/30 bg-accent/5 text-accent">Fonctionnalités</Badge>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-foreground leading-tight">
            Un signalement. <span className="text-primary">Toute une ville</span> qui réagit.
          </h2>
          <p className="mt-4 text-muted-foreground text-base sm:text-lg">
            Un formulaire seul ne suffit pas. RoutePulse combine capteurs humains, croisement de données et
            réseau social pour transformer chaque conducteur en radar utile.
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
            >
              <Card className="h-full rounded-2xl border-border p-6 shadow-soft hover:shadow-elevated transition-shadow flex flex-col">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const LiveMapSection = () => {
  const { stats } = useAppData();
  return (
  <section id="carte" className="py-20 sm:py-28 bg-gradient-surface relative overflow-hidden">
    <div className="absolute -top-40 -left-20 w-96 h-96 bg-accent/20 rounded-full blur-[100px]" />
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
      <div className="grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5">
          <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary">La carte</Badge>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold text-foreground leading-tight">
            Vois le trafic <span className="text-primary">respirer</span> en direct.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Chaque traçé devient un pouls coloré : vert (fluide), ambre (dense), rouge (bloqué), violet
            (danger). Les zones confirmées pulsent pour attirer ton attention.
          </p>
          <div className="mt-6 space-y-3">
            {[
              { c: "traffic-fluid", l: "Fluide", d: "Circulation normale, temps de trajet stable." },
              { c: "traffic-dense", l: "Dense", d: "Ralentissements sensibles, prévoir 10-20 min." },
              { c: "traffic-blocked", l: "Bloqué", d: "Accident, panne ou fermé. Déviation conseillée." },
              { c: "traffic-danger", l: "Danger", d: "Inondation, chaussée effondrée. À éviter." },
            ].map((row) => (
              <div key={row.l} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
                <span className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 bg-${row.c}`} />
                <div>
                  <p className="font-semibold text-sm text-foreground">{row.l}</p>
                  <p className="text-xs text-muted-foreground">{row.d}</p>
                </div>
              </div>
            ))}
          </div>
          <Link to="/app/carte" className="inline-flex items-center gap-1.5 mt-6 font-semibold text-primary group">
            Explorer la carte complète
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="lg:col-span-7">
          <div className="relative rounded-3xl border border-border bg-card shadow-elevated p-3 overflow-hidden">
            <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden">
              <TrafficMap allowFullscreen={false} />
            </div>
            <div className="absolute top-6 left-6 glass rounded-xl px-3 py-2 shadow-soft">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Abidjan · Live</p>
              <p className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> {fmtStat(stats?.activeAlerts)} alertes
              </p>
            </div>
            <div className="absolute bottom-6 left-6 right-6">
              <TrafficLegend />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
  );
};

const CommunitySection = () => {
  const { posts, stats, leaderboard } = useAppData();
  const topContributors = leaderboard.slice(0, 3);
  return (
  <section id="communaute" className="py-20 sm:py-28">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <Badge variant="outline" className="rounded-full border-accent/30 bg-accent/5 text-accent">Communauté</Badge>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold text-foreground leading-tight">
            Le premier <span className="text-accent">réseau social</span> de la route ivoirienne.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Poste tes alertes, réagis, confirme, discute avec ta zone. Chaque signalement peut devenir
            un fil de discussion sauvant du temps — et des vies.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <StatChip label="Signalements" value={fmtStat(stats?.reports)} icon={Send} tone="primary" />
            <StatChip label="Confirmations" value={fmtStat(stats?.confirmations)} icon={ShieldCheck} tone="accent" />
            <StatChip label="Alertes actives" value={fmtStat(stats?.activeAlerts)} icon={Camera} tone="primary" />
            <StatChip label="Villes couvertes" value={fmtStat(stats?.citiesCovered)} icon={MapPin} tone="accent" />
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {topContributors.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <h3 className="font-display font-semibold text-sm">Top contributeurs de la semaine</h3>
              </div>
              <div className="mt-4 space-y-3">
                {topContributors.map((c, i) => (
                  <div key={c.handle} className="flex items-center gap-3">
                    <span className="w-6 flex items-center justify-center">
                      <Medal className="w-4 h-4" style={{ color: ["#F59E0B", "#94A3B8", "#B87333"][i] }} />
                    </span>
                    <div className="w-9 h-9 rounded-full bg-gradient-hero text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {c.avatar || c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.tier} · {c.posts} signalement{c.posts > 1 ? "s" : ""}</p>
                    </div>
                    <span className="font-display font-semibold text-sm">{fmtStat(c.points)}<span className="text-[10px] text-muted-foreground font-medium ml-0.5">pts</span></span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Signale, fais confirmer tes alertes, gravis les paliers — de Nouveau à Ambassadeur.
              </p>
            </div>
          )}
          {posts.slice(0, 2).map((post) => (
            <AlertPost key={post.id} post={post} compact />
          ))}
        </div>
      </div>
    </div>
  </section>
  );
};

const HowItWorks = () => (
  <section className="py-20 sm:py-28">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary">Comment ça marche</Badge>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold text-foreground leading-tight">
          3 secondes pour <span className="text-primary">sauver 30 minutes</span> à quelqu’un.
        </h2>
      </div>
      <div className="mt-12 grid md:grid-cols-3 gap-4">
        {[
          { n: "01", t: "Ouvre & appuie", d: "Le bouton central. Ta position est capturée automatiquement." },
          { n: "02", t: "Choisis le type", d: "Bouchon, accident, inondation, nid de poule... 6 catégories." },
          { n: "03", t: "La ville voit", d: "L’alerte apparaît sur la carte et dans le fil. La commu confirme." },
        ].map((s) => (
          <Card key={s.n} className="rounded-2xl p-6 border-border bg-card relative overflow-hidden flex flex-col">
            <span className="font-display text-6xl font-semibold text-primary/10 absolute -top-3 right-2">{s.n}</span>
            <h3 className="font-display text-xl font-semibold text-foreground">{s.t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

const Trust = () => {
  const items = [
    { icon: Layers, title: "Fiabilisé, pas du bruit", text: "Une alerte devient « confirmée » quand plusieurs signalements indépendants convergent sur une même zone. L'IA écarte le signalement isolé ou malveillant." },
    { icon: ShieldCheck, title: "Tes données restent à toi", text: "Position utilisée uniquement au moment du signalement. Anonymisation par défaut, aucun tracking permanent, aucune donnée personnelle revendue." },
    { icon: Sparkles, title: "Gratuit, sans compte", text: "Signaler ne demande aucune inscription. L'app reste 100% gratuite pour les citoyens — c'est le cœur de la communauté." },
  ];
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <Badge variant="outline" className="rounded-full border-accent/30 bg-accent/5 text-accent">Confiance</Badge>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold text-foreground">
            Une info fiable. Des données respectées.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Pas de promesses en l'air : voici comment RoutePulse mérite ta confiance dès le premier signalement.
          </p>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {items.map((t) => (
            <Card key={t.title} className="rounded-2xl p-6 border-border bg-card flex flex-col">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <t.icon className="w-5 h-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{t.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">{t.text}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

const FAQ = () => (
  <section id="faq" className="py-20 sm:py-28 bg-gradient-surface">
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary">FAQ</Badge>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold">Les questions qu’on nous pose.</h2>
      </div>
      <Accordion type="single" collapsible className="mt-10 space-y-3">
        {[
          { q: "L’app est-elle vraiment gratuite ?", a: "Oui, 100% gratuite pour les citoyens. Le modèle économique repose sur les tableaux de bord B2B (assureurs, flottes, État)." },
          { q: "Comment êtes-vous sûrs que l’info est fiable ?", a: "On croise plusieurs signalements du même type dans un périmètre / une fenêtre temporelle. Une alerte devient «zone confirmée» après N validations." },
          { q: "Faut-il créer un compte ?", a: "Non. Tu peux signaler sans compte. Créer un profil te donne accès au fil social et à tes badges de contributeur." },
          { q: "Dans quelles villes êtes-vous disponibles ?", a: "Abidjan pour l’instant — signalement, carte et « avant de partir » y sont pleinement fonctionnels. L’extension aux autres villes ivoiriennes est notre prochaine étape." },
          { q: "Comment sont traitées mes données ?", a: "Position uniquement au moment du signalement. Anonymisation par défaut. Aucun tracking permanent." },
        ].map((item, i) => (
          <AccordionItem key={i} value={`item-${i}`} className="bg-card border border-border rounded-2xl px-5 shadow-soft">
            <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-4">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

const CTA = () => {
  const { stats } = useAppData();
  return (
  <section className="py-20 sm:py-28">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-dark p-10 sm:p-16 shadow-elevated">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-primary/40 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-accent/30 rounded-full blur-[100px]" />
        <div className="relative max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-white leading-tight">
            Rejoins les {fmtStat(stats?.contributors)} citoyens qui rendent la route <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-glow to-warning">plus sûre.</span>
          </h2>
          <p className="mt-4 text-white/70">
            2 minutes pour t’installer. 3 secondes par signalement. Un impact toute la journée.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/app">
              <Button size="lg" className="rounded-xl bg-primary-foreground text-foreground hover:bg-primary-foreground/90 h-12 px-6">
                Ouvrir RoutePulse <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
  );
};

const Footer = () => (
  <footer className="border-t border-border py-10">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-hero flex items-center justify-center">
          <Activity className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <span className="font-display font-semibold text-foreground">RoutePulse CI</span>
        <span className="text-xs text-muted-foreground ml-2">© 2025 · Made with <Heart className="inline w-3 h-3 text-primary fill-primary" /> à Abidjan</span>
      </div>
      <div className="flex gap-6 text-xs text-muted-foreground">
        <Link to="/collectivites" className="hover:text-foreground">Collectivités &amp; partenaires</Link>
        <a href="#" className="hover:text-foreground">Confidentialité</a>
        <a href="#" className="hover:text-foreground">CGU</a>
        <a href="#" className="hover:text-foreground">Presse</a>
        <a href="#" className="hover:text-foreground">Contact</a>
      </div>
    </div>
  </footer>
);

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <Hero />
      <Features />
      <LiveMapSection />
      <CommunitySection />
      <HowItWorks />
      <Trust />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
