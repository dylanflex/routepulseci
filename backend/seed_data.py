"""Demo dataset for RoutePulse — a densely populated Abidjan snapshot.

Pure data only (no ORM imports) so it can be consumed both by the app's
first-run seeding (``server.seed_if_empty``) and by the standalone
``reseed.py`` script without any circular imports.

Coordinates are approximate real-world positions around Abidjan's communes in
[lat, lng] order. They are indicative, not surveyed geometry.
"""

# Shared password for all seeded "contributor" accounts. These accounts exist
# to make community stats (contributor count) reflect a real, populated DB —
# they are demo data, not real credentials.
DEMO_PASSWORD = "routepulse-demo"

# (username, display_name, avatar initials, badge)
# The badge is only a hint for the intended demo spread — actual badges are
# always computed live from each account's real seeded posts/confirmations
# (see server.resolve_authors), so a mismatch here is cosmetic, not a bug.
USERS = [
    ("aya_abj", "Aya Koné", "AK", "Contributeur Or"),
    ("kouassi_m", "Kouassi M.", "KM", "Voisin vigilant"),
    ("fatoud", "Fatou Diallo", "FD", "Ambassadeur"),
    ("ibs_ci", "Ibrahim Sangaré", "IS", "Nouveau"),
    ("serge_b", "Serge Brou", "SB", "Contributeur"),
    ("awa_t", "Awa Touré", "AT", "Voisin vigilant"),
    ("moussa_l", "Moussa Lam", "ML", "Contributeur"),
    ("chantal_g", "Chantal Gbagbo", "CG", "Ambassadeur"),
    ("didier_z", "Didier Zadi", "DZ", "Contributeur Or"),
    ("nadege_k", "Nadège Kouamé", "NK", "Nouveau"),
    ("yao_ph", "Yao Philippe", "YP", "Contributeur"),
    ("mariam_c", "Mariam Cissé", "MC", "Voisin vigilant"),
    ("olivier_n", "Olivier N'Guessan", "ON", "Contributeur"),
    ("bakary_s", "Bakary Sylla", "BS", "Nouveau"),
    ("estelle_a", "Estelle Aka", "EA", "Ambassadeur"),
    ("franck_ko", "Franck Koffi", "FK", "Contributeur"),
    ("rachel_yt", "Rachel Yeboua", "RY", "Contributeur"),
    ("hamed_ou", "Hamed Ouattara", "HO", "Contributeur Or"),
    ("linda_bp", "Linda Bamba", "LB", "Nouveau"),
    ("seydou_dt", "Seydou Diomandé", "SD", "Voisin vigilant"),
    ("prisca_ov", "Prisca Ov.", "PO", "Contributeur"),
    ("armand_kp", "Armand Kpan", "AK", "Nouveau"),
    ("mimi_abj", "Mimi Abj.", "MA", "Contributeur"),
    ("joel_tk", "Joël Tanoh", "JT", "Contributeur"),
]

# (type, lat, lng, road, severity, confirmed, age_minutes)
# Types: degraded | accident | jam | flood | police | works
# Severity: fluid | dense | blocked | danger
INCIDENTS = [
    # --- Cocody / Riviera / Angré ---
    ("jam", 5.3720, -3.9820, "Bd Latrille", "blocked", 24, 6),
    ("accident", 5.3605, -3.9585, "Riviera 3, Rond-point", "blocked", 17, 11),
    ("degraded", 5.3680, -3.9750, "Rue des Jardins", "dense", 9, 32),
    ("works", 5.3600, -3.9600, "Bd VGE", "dense", 7, 54),
    ("police", 5.3550, -3.9650, "Bd Mitterrand", "fluid", 4, 18),
    ("jam", 5.3810, -3.9960, "Angré 8e Tranche", "dense", 13, 21),
    ("degraded", 5.3495, -3.9880, "II Plateaux, Rue Ministre", "dense", 6, 48),
    ("jam", 5.3660, -3.9700, "Bd des Martyrs", "blocked", 19, 9),
    ("accident", 5.3555, -3.9530, "Palmeraie, Carrefour", "danger", 22, 4),
    # --- Plateau ---
    ("jam", 5.3250, -4.0200, "Bd de la République", "blocked", 28, 7),
    ("works", 5.3290, -4.0170, "Av. Chardy", "dense", 5, 63),
    ("police", 5.3210, -4.0240, "Pont Général de Gaulle", "fluid", 3, 26),
    ("flood", 5.3230, -4.0130, "Bd Lagunaire", "danger", 34, 15),
    # --- Adjamé ---
    ("jam", 5.3560, -4.0210, "Carrefour Liberté", "blocked", 31, 5),
    ("degraded", 5.3600, -4.0180, "Bd Nangui Abrogoua", "dense", 11, 38),
    ("works", 5.3520, -4.0250, "Gare Adjamé", "blocked", 14, 72),
    # --- Yopougon ---
    ("degraded", 5.3450, -4.0750, "Yop, Bd Principal", "dense", 16, 22),
    ("jam", 5.3390, -4.0820, "Siporex, Carrefour", "blocked", 20, 13),
    ("flood", 5.3510, -4.0700, "Niangon, Rue 12", "danger", 18, 44),
    ("accident", 5.3330, -4.0880, "Autoroute Yop-Nord", "blocked", 12, 17),
    ("police", 5.3420, -4.0790, "Bd Antananarivo", "fluid", 2, 31),
    # --- Marcory / Zone 4 ---
    ("accident", 5.3010, -3.9905, "Carrefour SOLIBRA", "blocked", 15, 60),
    ("jam", 5.2990, -3.9850, "Bd VGE, Zone 4", "dense", 10, 19),
    ("degraded", 5.3050, -3.9950, "Marcory Résidentiel", "dense", 8, 41),
    # --- Treichville ---
    ("jam", 5.2950, -4.0100, "Bd de Marseille", "blocked", 21, 12),
    ("works", 5.2980, -4.0050, "Av. 16", "dense", 6, 58),
    ("flood", 5.2920, -4.0150, "Rue du Canal", "danger", 13, 36),
    # --- Koumassi ---
    ("degraded", 5.2950, -3.9550, "Bd du Cameroun", "dense", 9, 27),
    ("jam", 5.2900, -3.9600, "Grand Marché Koumassi", "blocked", 17, 14),
    # --- Abobo ---
    ("jam", 5.4200, -4.0200, "Abobo, Carrefour Banco", "blocked", 26, 8),
    ("degraded", 5.4150, -4.0250, "Av. N'Dotré", "dense", 12, 34),
    ("accident", 5.4260, -4.0150, "Bd des 40 Logements", "blocked", 14, 23),
    ("police", 5.4100, -4.0300, "Route d'Anyama", "fluid", 3, 29),
    # --- Port-Bouët / Aéroport ---
    ("works", 5.2560, -3.9300, "Bd de l'Aéroport", "dense", 7, 66),
    ("jam", 5.2600, -3.9350, "Vridi, Zone Portuaire", "blocked", 19, 16),
    ("flood", 5.2520, -3.9250, "Gonzagueville", "danger", 15, 47),
    # --- Attécoubé / Adjamé bridge ---
    ("jam", 5.3350, -4.0350, "Pont FHB", "blocked", 23, 10),
    ("degraded", 5.3380, -4.0400, "Attécoubé, Rue 8", "dense", 5, 52),
    # --- Bingerville axis ---
    ("works", 5.3550, -3.8850, "Route de Bingerville", "dense", 8, 55),
    ("accident", 5.3600, -3.9000, "Faya, Carrefour", "blocked", 11, 25),
]

# Posts: (username, location, type, severity, text, image, likes, shares,
#         confirmed, age_minutes, [comments])
# Each comment: (username, text, likes, age_minutes)
_IMG_JAM = "https://images.unsplash.com/photo-1708347456872-6ebd105740de?w=900&q=80"
_IMG_FLOOD = (
    "https://images.pexels.com/photos/7381785/pexels-photo-7381785.jpeg?w=900&q=80"
)

POSTS = [
    (
        "aya_abj",
        "Cocody, Riviera 3",
        "jam",
        "blocked",
        "Bouchon monstre sur la Riviera 3 après l'accident. Prendre le contournement par la Palmeraie 🙏 Ça n'avance plus depuis 20 min.",
        _IMG_JAM,
        142,
        34,
        18,
        8,
        [
            (
                "serge_b",
                "Confirmé, je suis coincé depuis 15 min. Merci du signalement 🙏",
                12,
                6,
            ),
            (
                "awa_t",
                "Il y a une déviation par la rue des Jardins pour ceux qui viennent d'Angré.",
                8,
                4,
            ),
            ("moussa_l", "La police vient d'arriver, ça devrait bouger.", 3, 2),
        ],
    ),
    (
        "kouassi_m",
        "Yopougon, Bd Principal",
        "degraded",
        "dense",
        "Énorme nid de poule à Yop. Deux motos déjà tombées. Attention en venant du marché !",
        None,
        87,
        19,
        9,
        22,
        [
            (
                "nadege_k",
                "Ils devraient vraiment réparer ça, ça fait des semaines.",
                5,
                18,
            ),
            ("bakary_s", "Merci du signalement, je passe par là ce soir.", 2, 10),
        ],
    ),
    (
        "fatoud",
        "Plateau, Bd Lagunaire",
        "flood",
        "danger",
        "Inondation sévère au Plateau après la pluie. La lagune déborde côté Boulay. Évitez absolument.",
        _IMG_FLOOD,
        312,
        128,
        42,
        41,
        [
            ("didier_z", "L'eau monte vite, prudence à tous.", 21, 38),
            ("chantal_g", "Le carrefour est totalement bloqué, bus déviés.", 14, 30),
        ],
    ),
    (
        "ibs_ci",
        "Marcory Zone 4",
        "accident",
        "blocked",
        "Collision entre un woro-woro et une berline au carrefour SOLIBRA. Les secours sont sur place.",
        None,
        54,
        6,
        5,
        60,
        [
            (
                "yao_ph",
                "Pas de blessés graves d'après ce que je vois, tant mieux.",
                4,
                52,
            ),
        ],
    ),
    (
        "chantal_g",
        "Adjamé, Carrefour Liberté",
        "jam",
        "blocked",
        "Adjamé complètement saturé ce matin. Les gbakas ne bougent plus. Comptez 40 min pour traverser 😩",
        None,
        176,
        47,
        31,
        5,
        [
            (
                "mariam_c",
                "Je confirme, parti d'Abobo il y a 1h et toujours pas au Plateau.",
                9,
                3,
            ),
            ("olivier_n", "Prenez le pont HKB plutôt, ça roule mieux.", 6, 2),
        ],
    ),
    (
        "didier_z",
        "Abobo, Carrefour Banco",
        "jam",
        "blocked",
        "Gros ralentissement à Abobo Banco. Un camion en panne bloque une voie. Patience 🚛",
        None,
        98,
        22,
        26,
        8,
        [],
    ),
    (
        "estelle_a",
        "Treichville, Bd de Marseille",
        "jam",
        "blocked",
        "Bd de Marseille bloqué à cause d'un marché sauvage qui déborde sur la route. Ça klaxonne de partout.",
        None,
        63,
        11,
        21,
        12,
        [
            ("franck_ko", "Chaque vendredi c'est pareil ici franchement.", 7, 9),
        ],
    ),
    (
        "hamed_ou",
        "Port-Bouët, Gonzagueville",
        "flood",
        "danger",
        "Route inondée à Gonzagueville, l'eau arrive au niveau des portières. Ne tentez pas de passer en berline.",
        _IMG_FLOOD,
        221,
        89,
        15,
        47,
        [
            ("linda_bp", "Merci, je fais demi-tour du coup 🙏", 11, 40),
            ("seydou_dt", "Les taxis passent encore mais c'est risqué.", 5, 35),
        ],
    ),
    (
        "yao_ph",
        "Angré 8e Tranche",
        "degraded",
        "dense",
        "La route de la 8e tranche est dans un état catastrophique après les pluies. Nids de poule partout.",
        None,
        74,
        15,
        13,
        21,
        [],
    ),
    (
        "mariam_c",
        "Cocody, Bd Latrille",
        "jam",
        "blocked",
        "Latrille bouché depuis le carrefour Duncan. Un feu tricolore en panne. Un agent régule à la main 👮",
        None,
        129,
        28,
        24,
        6,
        [
            ("prisca_ov", "Vivement qu'ils réparent ce feu, 3e fois ce mois-ci.", 8, 4),
        ],
    ),
    (
        "olivier_n",
        "Yopougon, Siporex",
        "jam",
        "blocked",
        "Carrefour Siporex à l'arrêt total. Accrochage entre deux taxis. Évitez si vous pouvez.",
        None,
        91,
        18,
        20,
        13,
        [],
    ),
    (
        "seydou_dt",
        "Koumassi, Grand Marché",
        "jam",
        "blocked",
        "Impossible d'avancer autour du grand marché de Koumassi. Livraisons en double file partout.",
        None,
        67,
        9,
        17,
        14,
        [
            (
                "armand_kp",
                "C'est le chaos tous les matins, faut partir avant 7h.",
                4,
                11,
            ),
        ],
    ),
    (
        "franck_ko",
        "Plateau, Pont Général de Gaulle",
        "police",
        "fluid",
        "Contrôle de police à l'entrée du pont Général de Gaulle. Ça roule mais ayez vos papiers.",
        None,
        43,
        4,
        3,
        26,
        [],
    ),
    (
        "linda_bp",
        "Attécoubé, Pont FHB",
        "jam",
        "blocked",
        "Pont FHB saturé dans le sens Attécoubé-Plateau. Un poids lourd en panne sur la voie de droite.",
        None,
        112,
        25,
        23,
        10,
        [
            ("mimi_abj", "Confirmé, bloquée dessus depuis 20 min 😤", 9, 7),
        ],
    ),
    (
        "prisca_ov",
        "Riviera Palmeraie",
        "accident",
        "danger",
        "Accident sérieux au carrefour Palmeraie. Deux véhicules, airbags déployés. Secours en route, dégagez le passage 🚑",
        None,
        187,
        63,
        22,
        4,
        [
            ("joel_tk", "J'ai appelé les pompiers, ils arrivent.", 15, 3),
            ("hamed_ou", "Prudence, morceaux de verre sur toute la chaussée.", 8, 2),
        ],
    ),
]
