# Taama — Bible de scénario, chapitre 1 « Djenné »

Sources : document de conception Notion v1.0 (page 13fd065c…, lu en entier), code existant (`app/tapama-core.js`, `dispositif1.js`, `neantis-base.js`, `vehicle.js`, `city-map.js`, `game-ui.js`, `tapama.js`), recherche web.
Conventions : `{nom}` = prénom du joueur. Dans le code actuel les répliques utilisent `who: 'tapama' | 'player'` (pas `joueur`) : on garde `player`. Humeurs de Tapama : `neutre, curieuse, inquiete, surprise, attentive, souriante`.
Marquage : **[DOC]** = vient du document de concept ; **[PROPOSÉ]** = inventé ici, à valider ; **[CODE]** = existe déjà.

---

## 1. Faits retenus

### 1.1 La Tapama historique (légende, pas histoire documentée)

| Élément | Ce qu'on sait | Certitude |
|---|---|---|
| Nom | **Tapama Djénépo** (« Djénépo Tapama » selon les sites). Une recueil de légendes recensé par la BnF cite « Tapama Djénépo de Djenné », une « jeune fille pure ». | Existence de la légende : confirmée. Existence historique de la personne : **non démontrée**. |
| Récit | Jeune fille (Bozo selon certaines versions ; « 12 ans » selon d'autres) **emmurée vivante / sacrifiée** pour conjurer un mauvais sort ou des génies (maisons/remparts qui s'effondraient, inondation, ou prospérité de la région) afin que Djenné puisse exister et tenir. | **Légende**, versions divergentes (guides de voyage : evaneos, untamedtravelling, monsoondiaries). Aucune source académique trouvée. |
| Époque / exploits | Aucune date fiable. Elle est associée à la **fondation de la ville** (Djenné-Jeno, Bozo, ~IIIe s. selon une ancienne version de Wikipédia, donc à revérifier). | **Incertain.** |

Conséquences pour l'écriture :
- Le brief dit « héroïne qui a accompli des choses ». Les faits disent plutôt « héroïne du sacrifice qui a protégé la ville ». Les dialogues disent donc « selon la légende, elle s'est sacrifiée pour que la ville tienne debout » — formulé doux pour 12-17 ans (pas de détail « emmurée vivante »). **À valider par le créateur.**
- Dire dans le jeu « la légende raconte… » et jamais « c'est arrivé ». Le document §10 exige de ne pas confondre fiction et histoire.
- Lien utile : le nom de famille **Traoré** est aussi celui du maître maçon qui aurait dirigé la reconstruction de 1907 (Ismaïla Traoré, vu dans une source anglaise ; non recoupé ici). Clin d'œil possible, à ne pas affirmer comme lien de parenté.
- Orthographe : le jeu s'écrit « Taama », le personnage « Tapama » [DOC].

### 1.2 Grande Mosquée de Djenné

| Fait | Chiffre retenu | Sources / divergences |
|---|---|---|
| Piliers intérieurs | **90** | mosqpedia.org et techno-science.net (« 90 piliers supportent le toit »). Divergence : Google Arts & Culture dit **100**. Le modèle 3D `piliers-interieur.glb` est un seul nœud « Piliers » : le nombre n'est pas vérifiable dans le modèle. |
| Canaris (trous d'aération coiffés de bols/poteries en terre cuite) | **104** | mosqpedia, techno-science, Google Arts (« 104 trous d'aération » ; sacredsites : capuchons en céramique faits par les femmes de la ville, retirés pour aérer). Cohérent entre toutes les sources. Dans le modèle 3D : un nœud « Canaris » (unique, non comptable). `i18n-en.js` décrit déjà « des bols en terre cuite (canaris), posés à l'envers ». |
| Reconstruction actuelle | **1907** (travaux 1906-1907) | rtbf, sacredsites, Google Arts, techno-science. Divergence : designingbuildings.co.uk dit « terminée en 1909 ». On retient 1907 (date la plus courante). Les énigmes n'acceptent que 1907. C'est la « troisième » mosquée. |
| Plâtrage annuel (crépissage) | **Chaque année, vers la fin de la saison sèche (avril le plus souvent)**, mélange de terre et d'eau (banco), toute la ville s'y met, ~4 h, par quartiers | rtbf, batiweb (cérémonie du 28 avril 2019), Google Arts. Date exacte : fixée par les anciens, donc non fixe. |
| Torons | Fagots de bois de palmier rônier qui dépassent des murs et servent d'échafaudage permanent | wheretheleavesfall, techno-science. Dans le modèle : `Torons_Externes`, `Torons_Internes`. |
| Tours en façade | **3** tours/minarets sur la façade est | Connaissance générale (pas confirmé par la recherche de cette session) ; le modèle a un nœud `Minarets`. À vérifier visuellement dans le jeu avant de coder l'énigme 5. |
| Dimensions | ~75 m de côté, ~20 m de haut selon techno-science | Source unique, à ne pas utiliser en énigme. |
| UNESCO | « Villes anciennes de Djenné » inscrites en **1988** | Connaissance générale, non revérifiée ici ; utilisée dans l'énigme 6 (à confirmer avant mise en ligne). |

Je ne dis pas « fait vérifié » pour 3 tours et 1988 : à confirmer par l'équipe.

---

## 2. Profil de Tapama (jeu)

[DOC §3.2] Tapama Traoré, **31 ans**, de Djenné, chercheuse en histoire et patrimoine (études à Bamako). Foulard ocre/terre, tresses relevées, boucles d'oreilles dorées, tenue chaude et bleue. **Jamais en 3D** : portrait 2D + bulles (webp dans `assets/images/tapama/tapama-<mood>.webp`). Grand-père conteur. Intelligente, méthodique, curieuse, déterminée ; elle aime comprendre avant de conclure, formule des hypothèses, se corrige, peut prendre des risques. Rôle : lancer la mission, analyser, aider aux énigmes, informer sur le patrimoine réel. Évolution : devient enquêtrice active.

**Ton de voix** [PROPOSÉ] : tutoiement, chaleureux, phrases courtes, un peu de mystère (« je ne sais pas encore », « il manque quelque chose »), jamais de cours magistral, encourage (« tu y es presque »), pose des questions (« tu vois ce que je vois ? »), s'excuse peu, rit un peu quand ça marche. Évite le jargon. Une idée par bulle (≤ 200 caractères).

**Humeurs** : `neutre` (information), `curieuse` (hypothèse, indice), `inquiete` (danger, NÉANTIS), `surprise` (révélation, coupure), `attentive` (réflexion, écoute), `souriante` (félicitation, encouragement, humour).

---

## 3. Dossier NÉANTIS

### 3.1 Organisation [DOC §4]
Organisation privée internationale **fictive** : technologies avancées, analyse de données, recherche d'objets rares. Officiellement scientifique ; en réalité une partie de la direction veut **s'approprier les informations révélées par les dispositifs**. Le nom évoque « néant/anéantissement » : ce qui tombe entre leurs mains disparaît des regards. Hiérarchie : PDG, responsable d'opération, agents (robots), techniciens. Base fictive au nord-ouest de Djenné [CODE `neantis-base.js`].

### 3.2 PDG
- **Nom de travail : Adrian Voss**, **48 ans**, directeur général, antagoniste principal [DOC, nom « de travail, pas définitif »].
- Look [DOC] : costume noir contemporain aux lignes nettes, détails **bleu électrique**, touches **métalliques dorées**, posture droite, expression maîtrisée, visage stylisé, proportions un peu cartoon. Référence : image `pdg-nexus-reference.png` du document (Notion ; non lisible hors Notion — la copier dans `assets/images/` avant de coder).
- Personnalité [DOC] : calme, intelligent, stratège, convaincu ; il donne des ordres précis ; il pense que les technologies et informations rares doivent être contrôlées par ceux qui en ont les moyens.
- Motivation [DOC] : comprendre le fonctionnement des dispositifs, localiser les autres, garder le contrôle de l'information. Le « pourquoi » profond reste caché au chapitre 1.
- Citation [PROPOSÉ, le document n'en donne pas] : « Une histoire que personne ne raconte n'appartient à personne. À celui qui la garde. »

### 3.3 Logo (le document donne seulement « emblème géométrique en forme de N », « à redessiner en vectoriel » ; description ci-dessous [PROPOSÉ])
SVG 100×100, fond noir `#0A0E14` en hexagone aplati (pointe en haut), contour doré `#C9A24B` 3 px. Au centre un **N géométrique** : deux montants verticaux (x=32 et x=68, de y=28 à y=72, épaisseur 9) reliés par une diagonale qui descend de gauche (32,28) à droite (68,72), épaisseur 9, en **bleu électrique** `#1E90FF` avec un fin liseré blanc-bleu `#9FD4FF`. La diagonale est « coupée » au milieu par un trait doré horizontal court (y=50, x 44→56) : l'idée d'un œil fermé / d'un néant qui efface. Texte « NÉANTIS » en dessous (police sans-serif géométrique, majuscules, espacement large, blanc cassé). Version monochrome : N blanc sur noir.

### 3.4 Palette [DOC : noir, bleu électrique, doré métallique ; hex PROPOSÉS]
Noir `#0A0E14`, anthracite `#1B2330`, bleu électrique `#1E90FF`, bleu glace `#9FD4FF`, doré `#C9A24B`, blanc cassé `#EDEFF2`. Les lueurs de la base sont déjà `0x4aa8ff` [CODE].

### 3.5 Devise [le document n'en a pas ; PROPOSÉ]
« Tout voir. Tout garder. Rien rendre. »

### 3.6 Intentions (révélées en trois couches, [DOC §4.4])
1. Ils veulent récupérer les objets. 2. Ils savent déjà qu'il en existe d'autres (document trouvé dans la base, séquence 10). 3. Leur but est le **contrôle des informations** révélées. Le pourquoi reste ouvert.

### 3.7 Méthodes [DOC + PROPOSÉ]
Surveillance (drones, scans), intervention rapide (vol du dispositif 2 pendant que tu hésites), verrouillage des accès, collecte de données. [PROPOSÉ] : ils n'attaquent jamais le joueur en face, ils le devancent (ils arrivent toujours juste avant lui).

### 3.8 Robots
[DOC §3.4] Agents **non humains**, flottent ou roulent. Trois types : surveillance (scanne, alerte), intervention (rapide, bloque), technique (verrouille les accès, protège les données). Noir, bleu électrique, touches métalliques, emblème N. Le drone « Drone N » [CODE `droneN.glb`] joue la sentinelle de surveillance. **« NEXUS » n'apparaît dans le document que dans le nom de fichier `pdg-nexus-reference.png`** : aucun robot ni département NEXUS n'est défini. [PROPOSÉ] si tu veux le garder : NEXUS = nom interne de la gamme de robots (« unités NEXUS »). Non utilisé dans les dialogues ci-dessous, sauf une mention facultative dans le dossier.

---

## 4. Découpage en scènes

Sauvegarde : clés localStorage proposées, préfixe `taama.`. Existantes [CODE] : `taama.dispositif1`, `taama.piste`, `taama.vol`, `taama.dispositif2`, `taama.revelation`, `taama.save.v1`, `taama.player.v1`.
Séquences GameUI (document §7) : 3 appel, 4 repérage, 5 dispositif 1, 6 deuxième piste, 7 vol, 8 poursuite, 9 découverte base, 10 récupération, 11 synchronisation, 12 menace (PDG), 13 fin.
Format des répliques : `{ who, mood, text }`. Radio = bulle courte pendant le jeu (`Tapama.radio({text, mood, duration})`).

**Écarts avec le code actuel à connaître** :
- `dispositif1.js` ouvre déjà un dialogue `dispositif` et une radio de piste « ruelles au sud-est » au moment de l'activation sur le toit, puis fait voler le dispositif 2 au cercle (`SECOND = -175,-219`, r=7). Dans le nouveau scénario, le cercle jaune devient le **laboratoire** et le vol a lieu **avant** l'arrivée du joueur à la mosquée. Ces blocs seront à réécrire.
- `Vehicle` : `enter()`/`exit()`/`park(x,z,yaw)` existent ; la radio de récupération actuelle dit déjà « pick-up garé près de la mosquée ».
- `CityMap` : `open()`, `close()`, `selectPlace(id)`, `clearRoute()`, `isOpen`. Les ids de lieux ne sont pas listés ici (non vérifiés).

### S0 — Ouverture (ACTE 0)
- Lieu : écran plein, portrait Tapama (première apparition), avant l'affichage du personnage. Déclencheur : nouvelle partie, après saisie du prénom. Séquence **3**.
- Voit : fond sable/ocre assombri, portrait grand format, bulles une à une.
- `Tapama.play('ouverture', {onEnd})` ; id de séquence à ajouter dans `SEQUENCES` :
```
{ who:'tapama', mood:'souriante', text:'Salut {nom} ! Je suis Tapama Traoré. Je porte le nom d’une héroïne de Djenné, Tapama Djénépo. Elle a veillé sur la ville, et je suis sa descendante.' }
{ who:'tapama', mood:'neutre',    text:'La légende raconte qu’elle s’est sacrifiée pour que Djenné tienne debout. Chez nous, on dit que les secrets de la ville appartiennent à ceux qui osent les chercher.' }
{ who:'tapama', mood:'curieuse',  text:'Depuis quelques années, je cherche un ancien dispositif caché dans la Grande Mosquée. Mon grand-père m’en parlait déjà quand j’étais petite, le soir, sous le ciel de Djenné.' }
{ who:'tapama', mood:'attentive', text:'Mes recherches sont formelles : il existe, quelque part dans la mosquée. J’ignore ce qu’il fait. Je veux le découvrir, et pour ça j’ai besoin de toi, {nom}.' }
{ who:'player', text:'Je suis prêt. Qu’est-ce que je dois faire ?' }
{ who:'tapama', mood:'souriante', text:'Fais décoller ton drone. Inspecte tous les recoins de la mosquée, en commençant par le haut. Je te guide par radio. Allez, on y va !' }
```
- Sauvegarde : `taama.acte = '0:done'`. Événement : `taama:ouverture-fin`. Séquence 3 complétée à la fin.

### S1 — Vol d'inspection (ACTE 1)
- Lieu : devant/au-dessus de la mosquée, drone. Déclencheur : fin de S0 (le jeu commence, le drone décolle). Séq. **4**.
- Voit : tutoriel commandes drone, objectif « Inspecte la mosquée en commençant par le haut ».
```
radio { mood:'curieuse', text:'Commence par le toit, {nom}. Les secrets aiment les hauteurs. Prends des photos si quelque chose te semble bizarre.' }
radio (après ~60 s sans repérage, indice) { mood:'attentive', text:'Cherche un objet qui ne ressemble pas à de la terre ou à du bois. Quelque chose de lisse, avec des motifs.' }
radio (dispositif repéré à la photo/scan) { mood:'surprise', text:'Attends… zoome encore ! Là, à moitié enfoui. C’est ça, {nom} ! Atterris et va le chercher.' }
```
- Sauvegarde : `taama.acte = '1:vol'`, `taama.d1.spotted = '1'`. Événement : `dispositif1:spotted` (nouveau). Séq. 4 complétée au repérage.

### S2 — Dispositif 1 récupéré
- Lieu : toit de la mosquée à pied (position `(-10, 15.3, 15)` [CODE]). Déclencheur : « Examiner » puis « Récupérer » [CODE : `dispositif1:active`, `dispositif1:taken`]. Garder l'activation courte, sans le dialogue `dispositif` actuel (il passe en S6).
- Radio à `dispositif1:taken` (remplace celle du code) :
```
radio { mood:'souriante', text:'Super, je vois que tu l’as récupéré ! Prends le pick-up garé devant la mosquée pour me rejoindre à ces coordonnées.', duration:9 }
```
- Quand la bulle disparaît : `CityMap.open()` avec destination = cercle jaune (`selectPlace` de son id, itinéraire tracé). Événement : `taama:carte-labo`. Sauvegarde : `taama.dispositif1='1'` [CODE], `taama.acte='1:d1'`.

### S3 — Trajet en pick-up
- Lieu : ville, voiture [CODE `Vehicle`]. Déclencheur : le joueur ferme la carte, monte dans le pick-up (E / ▲).
```
radio (1re conduite) { mood:'neutre', text:'Suis la ligne jaune sur ta carte. Je t’attends, il y a du café et un écran géant.' }   // le « café » est facultatif [PROPOSÉ]
```
- Arrivée dans le cercle jaune (`SECOND = (-175.012, -219.890)`, r=7 [CODE]) déclenche S4. Événement : `taama:arrive-labo` (nouveau).

### S4 — Entrée au laboratoire
- Lieu : intérieur du **labo de Tapama** (nouvelle interface plein écran, 2D : établi, écrans, machine à alvéole, cartes de Djenné au mur). Déclencheur : arrivée au cercle. Séq. **5** commence.
- Voit : le dispositif sort du sac et se place sur la machine ; Tapama (portrait) sur un écran.
```
{ who:'tapama', mood:'souriante', text:'Bienvenue chez moi, {nom} ! Pose le dispositif dans la machine, là, au centre. Doucement…' }
{ who:'tapama', mood:'attentive', text:'Il est verrouillé. Trois mots de passe, et ils parlent tous de la mosquée. On les trouve ensemble : tu observes, je cherche dans mes notes.' }
```
- `Lab.open({stage:1, onDone})`. Sauvegarde : `taama.lab1 = 'open'`.

### S5 — Énigmes 1 à 3 (labo, dispositif 1)
Voir §5. Textes de transition :
```
après E1 { who:'tapama', mood:'souriante', text:'Le premier verrou saute ! Tu vois, ensemble on avance vite. Plus que deux.' }
après E2 { who:'tapama', mood:'curieuse',  text:'Deux sur trois ! Le dernier est une date. Pense à la mosquée que tu vois aujourd’hui, pas à l’ancienne.' }
```
- Sauvegarde : `taama.lab1.q = '0'→'3'`. Événement : `lab:enigme-resolue` {stage, index}.

### S6 — Projection coupée (fin labo 1, séq. 5 puis 6)
- Déclencheur : 3e énigme résolue. Voit : lumière bleue, le dispositif se soulève, une **vidéo de projection** sort de lui (scène du passé, floue), puis **coupure brutale** (écran noir 1 s, grésillement). Réutiliser `showProjection` (`PROJ_MS=5000`) [CODE].
```
{ who:'tapama', mood:'surprise',  text:'Regarde ! Ce n’est pas un écran, ça sort de l’objet lui-même… {nom}, tu vois cette scène ?' }
(coupure, bruit sec)
{ who:'player', text:'Hé ! Elle a disparu d’un coup !' }
{ who:'tapama', mood:'inquiete',  text:'Attends, attends… Je regarde ce qui s’est passé.' }   // elle tape sur son clavier (son de touches 3 s)
{ who:'tapama', mood:'attentive', text:'Le dispositif n’a pas tout montré. Il manque une pièce : un autre dispositif est caché dans la mosquée. C’est lui qu’il nous faut, {nom}.' }
{ who:'tapama', mood:'inquiete',  text:'Retourne vers la mosquée avec le pick-up. Et fais vite, j’ai un mauvais pressentiment.' }
```
- Fin : `Lab` se ferme ; le joueur réapparaît **sur le cercle jaune**, voiture garée à côté. Séq. **5** puis **6** complétées. Sauvegarde : `taama.lab1='done'`, `taama.piste='1'` [CODE], `taama.acte='2:fin'`. Événements : `lab:done` {stage:1}, `dispositif1:piste` [CODE].

### S7 — Retour devant la mosquée (ACTE 3, séq. 7)
- Déclencheur : le joueur arrive à ~26 m de `(-10, 60)` [CODE `REV_SPOT`] en pick-up ou à pied.
```
radio { mood:'inquiete', text:'{nom}… un groupe est passé juste avant toi. Ils ont emporté le second dispositif. J’ai vu leurs images sur mon écran.', duration:10 }
```
- Puis ouverture du **dossier** (S8). Événement `neantis:vol` [CODE]. Séq. **7** complétée. Sauvegarde : `taama.vol='1'` [CODE]. Remarque : `stealDevice2()` actuel (déclenché au cercle) doit être désactivé ; le vol devient « off-screen ».

### S8 — Dossier NÉANTIS (écran de PC) + gadget + carte
- Interface `Dossier.open({onDone})` : fenêtre façon écran d'ordinateur (barre de titre « TAPAMA > RECHERCHES > NÉANTIS.pdf », fenêtres/onglets). Contenu : photo du PDG (« Adrian Voss, 48 ans »), logo (§3.3), devise, **3 intentions** (§3.6), texte court sur les robots. Séq. **8** démarre.
```
{ who:'tapama', mood:'attentive', text:'Je te transfère tout ce que j’ai sur eux. Ça s’appelle NÉANTIS. Voilà leur logo… et leur patron, Adrian Voss.' }
{ who:'tapama', mood:'neutre',    text:'Leur devise : « Tout voir. Tout garder. Rien rendre. » Ils veulent surtout contrôler ce que ces objets montrent, pas les vendre.' }
{ who:'tapama', mood:'inquiete',  text:'Leurs robots patrouillent partout. Mais je ne t’envoie pas sans rien : il y a un gadget dans la voiture. Avec lui, tu pourras te défendre.' }
{ who:'tapama', mood:'attentive', text:'Je t’affiche l’itinéraire de leur base. Regarde bien, et reviens-moi en un seul morceau.' }
```
- Avant fermeture : `CityMap.open()` avec l'itinéraire vers la base (`selectPlace('neantis')`, id à confirmer). Le joueur ferme la carte. Le gadget est « débloqué » (état `taama.gadget='1'`, activé dans la voiture).
- Événements : `dossier:open`, `dossier:done`, `taama:carte-base`. Sauvegarde : `taama.dossier='1'`, `taama.gadget='1'`.

### S9 — Route vers la base (séq. 8, poursuite)
- Joueur en voiture suit l'itinéraire.
```
radio { mood:'inquiete', text:'Ralentis avant le portail, {nom}. Gare-toi et continue à pied. Leurs drones balaient la zone.' }
```
- Séq. **8** complétée à l'arrivée (~portail, `Anchor_Portail` [CODE]).

### S10 — Dans la base (séq. 9 puis 10)
- Entrée à pied par le portail, drones N (sentinelles) à neutraliser avec le gadget (clic droit viser, clic neutraliser [CODE]), couloirs, portes `Neantis_Porte_*` [CODE], chambre forte (`Anchor_Dispositif`).
```
radio (entrée) { mood:'attentive', text:'Je te vois. Reste dans l’ombre. Quand un drone N s’approche, vise-le et tire : il se met en veille quelques secondes.' }
radio (1er drone neutralisé) { mood:'souriante', text:'Bien joué ! Mais ils vont être alertés, ne traîne pas.' }
{ who:'player', text:'Ils connaissaient déjà les autres emplacements. Ce n’est pas une découverte accidentelle.' }     // à la lecture du document dans la base
{ who:'tapama', mood:'attentive', text:'Alors ils ne sont pas là pour revendre un objet. Ils cherchent quelque chose de précis.' }
```
- Récupération du dispositif 2 [CODE `neantis:dispositif`, `taama.dispositif2='1'`]. Séq. **9** à l'entrée, **10** à la récupération.

### S11 — Sortie, « Rejoins-moi »
```
radio { mood:'souriante', text:'Tu l’as ! Rejoins-moi, {nom}. Je t’affiche le chemin jusqu’à chez moi.', duration:8 }
```
- À la disparition de la bulle : `CityMap.open()` itinéraire vers le **cercle jaune**. Le joueur rejoint le cercle **à pied** (il a le droit de reprendre le pick-up ; l'exigence est d'entrer dans le cercle). Entrée dans le cercle → S12. Événement : `taama:arrive-labo2`. Sauvegarde : `taama.acte='3:retour'`.

### S12 — Labo, dispositif 2 (séq. 11)
```
{ who:'tapama', mood:'surprise',  text:'Il est là ! {nom}, tu es incroyable. Pose-le dans la machine, à côté du premier.' }
{ who:'tapama', mood:'attentive', text:'Cette fois les verrous sont plus costauds. Trois nouveaux mots de passe. On y va, calmement.' }
```
- `Lab.open({stage:2, onDone})`. Énigmes 4 à 6 (§5). Sauvegarde : `taama.lab2.q = 0→3`.

### S13 — Projection finale qui plante
- Déclencheur : 3e énigme du stade 2 résolue. Les deux dispositifs s'illuminent, projection plus grande (carte lumineuse qui commence à s'afficher), puis **plante** (parasites, coupure électrique, labo dans le noir 2 s, lumières d'urgence).
```
{ who:'tapama', mood:'surprise',  text:'Regarde cette carte, {nom}. Djenné n’est qu’un point parmi d’autres.' }
(la projection saute, noir, bruit de coupure)
{ who:'tapama', mood:'inquiete',  text:'Non, non, non… Reste avec moi, je relance les écrans.' }       // clavier
{ who:'tapama', mood:'attentive', text:'Les deux dispositifs ne sont qu’un début. Il y en a d’autres, cachés ailleurs en Afrique de l’Ouest. NÉANTIS le sait aussi.' }
{ who:'player', text:'Alors on doit les trouver avant eux.' }
{ who:'tapama', mood:'souriante', text:'Exactement. Prochaine étape : Bandiagara, dans les falaises. Prépare ton sac, {nom} !' }
```
- Séq. **11** complétée. Événement : `lab:done` {stage:2}. Sauvegarde : `taama.lab2='done'`, `taama.revelation='1'` [CODE].

### S14 — Fin du chapitre (séq. 12 facultative, 13)
- Séq. **12** [DOC : scène du PDG qui reçoit le rapport, courte cinématique/écran « communication interceptée ». Non demandée dans ton scénario : [PROPOSÉ] en 2 bulles sur l'écran du labo pour garder le fil du document]
```
{ who:'tapama', mood:'inquiete', text:'J’ai capté une transmission, regarde : « Le dispositif est perdu, mais pas les pistes. Surveillez-les. » C’est Voss.' }
```
- Séq. **13** : `GameUI.show('carte')` [CODE], Djenné terminé, **Bandiagara** s'affiche comme prochaine destination (le document annonce Bandiagara et Ségou, + piste Lomé ; chapitre 2 = **Bandiagara** [DOC §11]), les autres restent verrouillées. Événement : `taama:chapitre1-fin`. Sauvegarde : `taama.chapitre1='done'`, `taama.next='bandiagara'`.

---

## 5. Énigmes du labo

Normalisation : minuscules, accents et espaces retirés, chiffres en lettres convertis (« quatre-vingt-dix » = 90), « ans » et ponctuation ignorés. Saisie numérique/texte. Après 2 mauvaises réponses, Tapama propose automatiquement l'indice suivant. Les indices respectent le ton : vague (1), plus précis (2).

### Dispositif 1

**E1 — Piliers**
- Question : « Mot de passe 1 : combien de piliers soutiennent le toit à l'intérieur de la mosquée ? »
- Réponse : `90` (accepte « 90 », « quatre-vingt-dix »).
- Indice 1 : « Ils sont rangés comme des soldats. Tu en as vu beaucoup, mais moins de cent ! » (tolère 100 → voir erreur).
- Indice 2 : « Pense à des rangées bien régulières : neuf fois dix, si ça t’aide à compter. » [PROPOSÉ ; la structure « 9 rangées × 10 » vient d'un seul site, à valider]
- Réussite : « 90 ! Le premier verrou saute. Ces piliers portent tout le toit, {nom}. »
- Erreur : « Hmm, pas tout à fait. Reprends le plan de la salle de prière, je t’aide. » (si 100 : « Tu y es presque. Certains livres disent 100, mais pour notre dispositif, c’est un peu moins. »)

**E2 — Canaris**
- Question : « Mot de passe 2 : combien de canaris (les pots de terre cuite) coiffent les trous d’aération du toit ? »
- Réponse : `104` (« cent quatre »).
- Indice 1 : « Un peu plus d’une centaine. Chaque pot laisse l’air circuler et protège de la pluie. »
- Indice 2 : « Cent… plus quatre. Cherche près de la ligne de crête du toit. »
- Réussite : « 104 ! Bien vu. Tu as bien regardé là-haut avec ton drone. »
- Erreur : « Presque ! Il y en a un peu plus ou un peu moins. Je te redonne un coup de pouce ? »

**E3 — Année de reconstruction**
- Question : « Mot de passe 3 : en quelle année la mosquée actuelle a-t-elle été reconstruite ? »
- Réponse : `1907`.
- Indice 1 : « Ni très ancienne, ni récente : le début du XXe siècle. »
- Indice 2 : « On a commencé en 1906. Les maçons ont fini l’année suivante. »
- Réussite : « 1907 ! La mosquée que tu vois aujourd’hui a plus de cent ans. »
- Erreur : « Pas cette année-là. Souviens-toi : c’est la troisième mosquée à cet endroit. »

### Dispositif 2 (un cran au-dessus : mot, observation, calcul)

**E4 — Torons**
- Question : « Mot de passe 4 : les poutres de bois qui dépassent des murs servent d’échafaudage permanent pour le crépissage annuel. Comment les appelle-t-on ? »
- Réponse : `toron` / `torons`.
- Indice 1 : « Regarde les murs : ces bâtons en saillie, c’est le secret des maçons. Ils sont en palmier rônier. »
- Indice 2 : « Un mot de cinq lettres, qui commence par T. Au pluriel, ils hérissent tout le mur. »
- Réussite : « Les torons ! Grâce à eux, tout le monde grimpe pour recrépir la mosquée chaque année. »
- Erreur : « Presque ! Ce n’est pas un nom de pierre. Pense à ce qui dépasse des murs. »

**E5 — Tours de la façade**
- Question : « Mot de passe 5 : combien de grandes tours (minarets) as-tu vues sur la façade principale ? »
- Réponse : `3` / « trois » (**à vérifier visuellement dans le jeu avant de coder**).
- Indice 1 : « Regarde la façade qui fait face à la place du marché. Elles dominent tout. »
- Indice 2 : « Moins que les doigts d’une main, plus que deux. »
- Réussite : « Trois tours ! Elles sont couvertes de pointes d’autruche, tu as vu ? » [le décor d'œufs d'autruche au sommet des tours est de la connaissance générale, non vérifié ici : à retirer si doute]
- Erreur : « Hmm, compte encore. Va voir la façade avec ton drone si tu veux. »

**E6 — Calcul d'années**
- Question : « Mot de passe 6 : la mosquée actuelle date de 1907 ; Djenné est classée au patrimoine mondial par l’UNESCO en 1988. Combien d’années les séparent ? »
- Réponse : `81`.
- Indice 1 : « C’est une soustraction. Tu pars de 1988 et tu remontes jusqu’à 1907. »
- Indice 2 : « 1988 moins 1900 donne 88. Retire encore les 7 années qu’il y a entre 1900 et 1907. »
- Réussite : « 81 ans ! Tout se recoupe, {nom}. Les deux dispositifs s’allument. »
- Erreur : « Pas tout à fait. Écris les deux dates et soustrais lentement, je suis là. »
- (Alerte : 1988 à confirmer.)

---

## 6. Contrat d'API proposé

**Déjà existant [CODE]** (sûr d'après lecture) :
- `Tapama.play(idOuSéquence, {onEnd})`, `Tapama.radio(texte|{text,mood,duration}, {mood})`, `Tapama.analyse`, `Tapama.help`, `Tapama.journal()`, `Tapama.isBusy()`, `Tapama.RADIO`. Séquences : `SEQUENCES` dans `tapama-core.js` (ajouter `ouverture`, `labo1-intro`, `labo1-fin`, etc.).
- `GameUI.completeSequence(n)`, `GameUI.show('carte')`, `GameUI.save()`, `GameUI.addDiscovery(id)`.
- `CityMap.open()`, `.close()`, `.toggle()`, `.isOpen`, `.selectPlace(id)`, `.clearRoute()`.
- `Vehicle.enter()`, `.exit()`, `.park(x,y,yaw)`, `.state`, `.position`.
- `Dispositif1` : `activate()`, `take()`, `stealDevice2()`, `taken`, `reset()` ; `NeantisBase` : `loaded`, `center`, `anchor(nom)`, `deviceTaken`, `resetDevice()`.
- Événements window : `dispositif1:active`, `dispositif1:taken`, `dispositif1:piste`, `neantis:vol`, `neantis:dispositif`.

**À créer [PROPOSÉ]** (non existant) :
```js
Lab.open({ stage: 1|2, onDone })        // ouvre l'interface laboratoire, joue l'intro, enchaîne énigmes et projection
Lab.close()
Lab.state()                             // { stage, solved:[…], hintsUsed }
Dossier.open({ onDone })                // écran PC NÉANTIS (S8)
Tapama.play('ouverture', { onEnd })     // séquences nouvelles dans SEQUENCES
```
Événements `window` à émettre : `taama:ouverture-fin`, `dispositif1:spotted`, `taama:carte-labo`, `taama:arrive-labo`, `lab:open` {stage}, `lab:enigme-resolue` {stage,index}, `lab:done` {stage}, `dossier:open`, `dossier:done`, `taama:carte-base`, `taama:arrive-labo2`, `taama:chapitre1-fin`.
Clés localStorage : `taama.acte`, `taama.d1.spotted`, `taama.lab1`, `taama.lab1.q`, `taama.dossier`, `taama.gadget`, `taama.lab2`, `taama.lab2.q`, `taama.chapitre1`, `taama.next`.

---

## Résumé (10 lignes)
1. Chiffres retenus : **90 piliers** (divergence : Google Arts dit 100), **104 canaris**, **reconstruction 1907** (une source dit 1909), crépissage annuel (avril), torons, 3 tours en façade (à vérifier), UNESCO 1988 (à vérifier).
2. Tapama historique : **Tapama Djénépo**, légende de Djenné (jeune fille sacrifiée pour que la ville tienne). Existence historique non démontrée, versions divergentes, pas de source académique trouvée.
3. PDG : **Adrian Voss**, 48 ans, nom de travail non définitif ; devise, citation et logo détaillé sont proposés (le document ne les donne pas).
4. « NEXUS » n'existe pas dans le document, hormis le nom du fichier image du PDG.
5. Le code actuel (vol au cercle, dialogue au toit) contredit le nouveau scénario : à réécrire, voir §4.
6. Chapitre 2 annoncé : **Bandiagara** (puis Ségou, piste Lomé).
7. Le jeu s'écrit « Taama », le personnage « Tapama ».
8. Les images du document (PDG, logo) sont dans Notion : à exporter.
9. Les énigmes 5 et 6 dépendent de faits non revérifiés (3 tours, 1988).
10. Aucun fichier de code modifié.

Sources : [BnF Takam Tikou](https://takamtikou.bnf.fr/print/pdf/node/3481), [evaneos](https://www.evaneos.fr/mali/voyage/explorer/11219-1-djenne-et-sa-mosquee/), [untamedtravelling](https://www.untamedtravelling.com/en/destinations/africa/mali/djenne), [mosqpedia](https://mosqpedia.org/en/mosque/1044), [techno-science](https://www.techno-science.net/fr/definitions/grande-mosquee-de-djenne), [Google Arts & Culture](https://artsandculture.google.com/story/CgWxXtdyHavVxQ), [sacredsites](https://sacredsites.com/africa/mali/djenne.html), [designingbuildings](https://www.designingbuildings.co.uk/w/Great_Mosque_of_Djenne), [rtbf](https://www.rtbf.be/article/le-plus-grand-monument-en-terre-au-monde-est-recrepi-annuellement-au-mali-11561443), [batiweb](https://www.batiweb.com/actualites/vie-pratique/a-djenne-au-mali-les-habitants-crepissent-eux-meme-la-grande-mosquee-34570).
