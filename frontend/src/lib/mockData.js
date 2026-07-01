// Mock data for RoutePulse CI prototype
export const INCIDENT_TYPES = {
  degraded: { label: "Route dégradée", icon: "AlertTriangle", color: "traffic-dense", emoji: "🕳️" },
  accident: { label: "Accident", icon: "Siren", color: "traffic-blocked", emoji: "🚧" },
  jam: { label: "Embouteillage", icon: "CarFront", color: "traffic-dense", emoji: "🚗" },
  flood: { label: "Inondation", icon: "Waves", color: "traffic-danger", emoji: "🌊" },
  police: { label: "Contrôle", icon: "ShieldAlert", color: "info", emoji: "👮" },
  works: { label: "Travaux", icon: "HardHat", color: "traffic-dense", emoji: "🚜" },
};

export const TRAFFIC_LEVELS = {
  fluid: { label: "Fluide", color: "traffic-fluid", hex: "#2fb56b" },
  dense: { label: "Dense", color: "traffic-dense", hex: "#f59e0b" },
  blocked: { label: "Bloqué", color: "traffic-blocked", hex: "#e0432c" },
  danger: { label: "Danger", color: "traffic-danger", hex: "#a855c9" },
};

// Road network (SVG paths) — abstract representation of Abidjan
export const ROAD_NETWORK = [
  { id: "r1", name: "Bd Latrille", d: "M 40 120 Q 200 80 380 130 T 720 180", level: "blocked" },
  { id: "r2", name: "Bd de France", d: "M 60 260 L 300 260 L 480 300 L 720 280", level: "dense" },
  { id: "r3", name: "Autoroute du Nord", d: "M 100 40 Q 250 200 400 260 T 700 420", level: "fluid" },
  { id: "r4", name: "Pont HKB", d: "M 200 380 L 420 380 L 620 340", level: "dense" },
  { id: "r5", name: "Bd VGE", d: "M 40 460 Q 240 420 460 460 T 720 500", level: "fluid" },
  { id: "r6", name: "Rue des Jardins", d: "M 320 60 L 340 200 L 380 340 L 420 500", level: "blocked" },
  { id: "r7", name: "Bd Giscard d'Estaing", d: "M 540 60 L 520 200 L 500 340 L 480 500", level: "dense" },
  { id: "r8", name: "Corniche", d: "M 60 540 Q 300 520 540 540 T 740 560", level: "danger" },
];

export const INCIDENTS = [
  { id: "i1", type: "jam", x: 220, y: 130, road: "Bd Latrille", severity: "blocked", confirmed: 12, time: "il y a 6 min" },
  { id: "i2", type: "accident", x: 480, y: 300, road: "Bd de France", severity: "blocked", confirmed: 8, time: "il y a 14 min" },
  { id: "i3", type: "flood", x: 600, y: 540, road: "Corniche", severity: "danger", confirmed: 21, time: "il y a 3 min" },
  { id: "i4", type: "degraded", x: 350, y: 240, road: "Rue des Jardins", severity: "dense", confirmed: 4, time: "il y a 32 min" },
  { id: "i5", type: "works", x: 520, y: 200, road: "Bd VGE", severity: "dense", confirmed: 3, time: "il y a 1h" },
  { id: "i6", type: "police", x: 140, y: 460, road: "Bd Giscard", severity: "fluid", confirmed: 2, time: "il y a 18 min" },
];

export const POSTS = [
  {
    id: "p1",
    author: { name: "Aya K.", handle: "@aya_abj", avatar: "AK", verified: true, badge: "Contributeur Or" },
    time: "il y a 8 min",
    location: "Cocody, Riviera 3",
    type: "jam",
    severity: "blocked",
    text: "Bouchon monstre sur la Riviera 3 après l'accident. Prendre le contournement par la Palmeraie 🙏 Ça n'avance plus depuis 20 min.",
    image: "https://images.unsplash.com/photo-1708347456872-6ebd105740de?w=900&q=80",
    likes: 142, comments: 28, shares: 34, confirmed: 18,
  },
  {
    id: "p2",
    author: { name: "Kouassi M.", handle: "@kouassi_m", avatar: "KM", verified: false, badge: "Voisin vigilant" },
    time: "il y a 22 min",
    location: "Yopougon, Bd Principal",
    type: "degraded",
    severity: "dense",
    text: "Énorme nid de poule à Yop. Deux motos déjà tombées. Attention en venant du marché !",
    image: null,
    likes: 87, comments: 12, shares: 19, confirmed: 9,
  },
  {
    id: "p3",
    author: { name: "Fatou D.", handle: "@fatoud", avatar: "FD", verified: true, badge: "Ambassadeur" },
    time: "il y a 41 min",
    location: "Plateau, Bd Lagunaire",
    type: "flood",
    severity: "danger",
    text: "Inondation sévère au Plateau après la pluie. La lagune déborde côté Boulay. Évitez absolument.",
    image: "https://images.pexels.com/photos/7381785/pexels-photo-7381785.jpeg?w=900&q=80",
    likes: 312, comments: 64, shares: 128, confirmed: 42,
  },
  {
    id: "p4",
    author: { name: "Ibrahim S.", handle: "@ibs_ci", avatar: "IS", verified: false, badge: "Nouveau" },
    time: "il y a 1h",
    location: "Marcory Zone 4",
    type: "accident",
    severity: "blocked",
    text: "Collision entre un woro-woro et une berline au carrefour SOLIBRA. Les secours sont sur place.",
    image: null,
    likes: 54, comments: 8, shares: 6, confirmed: 5,
  },
];

export const COMMENTS = {
  p1: [
    { id: "c1", author: "Serge B.", avatar: "SB", time: "6 min", text: "Confirmé, je suis coincé depuis 15 min. Merci du signalement 🙏", likes: 12 },
    { id: "c2", author: "Awa T.", avatar: "AT", time: "4 min", text: "Il y a une déviation par la rue des Jardins pour ceux qui viennent d'Angré.", likes: 8 },
    { id: "c3", author: "Moussa L.", avatar: "ML", time: "2 min", text: "La police vient d'arriver, ça devrait bouger.", likes: 3 },
  ],
};

export const STATS = {
  activeAlerts: 247,
  contributors: 12840,
  citiesCovered: 6,
  timeSaved: "3h27",
};
