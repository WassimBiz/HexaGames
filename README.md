# HexaGuess

HexaGuess est un party game web multijoueur en temps réel avec trois modes sélectionnables dans le
lobby. Dans « Dessin mystère », un joueur choisit secrètement un champion parmi trois propositions,
le dessine, et les autres le devinent dans le chat. Dans « Imitation vocale », il écoute au casque
une réplique originale, découvre sa transcription cinq secondes plus tard puis l’imite à voix haute.
Dans « HexaMap », tous les joueurs observent un cadrage fixe puis placent une balise sur la carte
complète ; le score dépend de la distance au lieu attendu.

Le projet adopte une identité originale d’« atelier d’encre magique ». Il s’agit d’un projet
communautaire indépendant, sans interface, logo ou marque graphique copiée de Riot Games ou de
League of Legends.

## Démarrage local

Prérequis : Node.js 20 ou plus récent et npm 10 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez ensuite [http://localhost:5173](http://localhost:5173). Le frontend Vite écoute sur le port
5173 et l’API Socket.IO sur le port 3001. Pour simuler deux joueurs, ouvrez cette adresse dans deux
navigateurs, ou dans une fenêtre normale et une fenêtre privée. Créez un salon dans la première,
copiez le code à six caractères, rejoignez-le dans la seconde, marquez le second joueur prêt puis
lancez la partie depuis la première.

Pour jouer depuis plusieurs appareils sur le même Wi-Fi, ouvrez l’adresse réseau affichée par
`npm run dev` (par exemple `http://192.168.5.213:5173`) sur l’appareil hôte, créez un salon et
utilisez « Copier le lien ». Ouvrez ce lien sur les autres appareils : le code est prérempli. Si
Windows affiche une demande de pare-feu pour Node.js, autorisez l’accès sur les réseaux privés.

## Publication sur Render

Le dépôt inclut [`render.yaml`](./render.yaml). Une fois le projet poussé sur GitHub, GitLab ou
Bitbucket, créez un Blueprint Render à partir du dépôt. Render exécutera `npm ci && npm run build`,
puis `npm start`. Le même service Express sert le client compilé et Socket.IO sur une seule origine
HTTPS, ce qui évite toute configuration d’URL côté navigateur et permet l’autorisation du micro sur
téléphone.

Le plan gratuit convient aux tests entre amis, mais il s’endort après une période d’inactivité et
le premier chargement peut alors prendre environ une minute. Les salons étant conservés en mémoire,
un redémarrage de l’instance ferme les parties en cours.

Copiez `.env.example` vers `.env` si vous souhaitez modifier les ports, les origines CORS, la durée
de reconnexion ou la liste des champions désactivés. Les variables sont validées au démarrage.

## Commandes

```bash
npm run dev          # serveur en rechargement à chaud et client local de production
npm run lint         # ESLint sur le monorepo
npm run typecheck    # TypeScript sur les trois workspaces
npm run test         # tests unitaires et intégration Socket.IO
npm run test:e2e     # scénario Playwright à deux contextes Chromium
npm run build        # bundles de production client et serveur
npm run format       # Prettier
```

Le scénario E2E utilise le canal Google Chrome du système. Chrome doit donc être installé sur la
machine qui exécute Playwright.

## Architecture

Le dépôt est un monorepo npm workspaces :

- `packages/shared` : types réseau, schémas Zod et formes publiques/privées partagées ;
- `packages/server` : Express, Socket.IO, moteur de partie, repository et service Data Dragon ;
- `packages/client` : React, Vite, interface responsive et moteur de dessin Canvas ;
- `e2e` : parcours Playwright avec deux contextes de navigateur ;
- `docs/socket-events.md` : contrat temps réel.

La partie suit la machine à états serveur `LOBBY → CHOOSING → DRAWING → ROUND_RESULTS →
GAME_RESULTS`. Seul le serveur déclenche les transitions, mesure le temps, choisit les indices,
vérifie les réponses et calcule les points. `RoomRepository` isole le stockage en mémoire et pourra
être implémenté avec Redis sans modifier les règles du jeu.

HexaMap réutilise les phases internes `CHOOSING` et `DRAWING`, mais démarre directement une manche
simultanée sans dessinateur. Le serveur choisit la carte avec les probabilités demandées : 85 %
Faille de l’invocateur, 10 % Abîme hurlant et 5 % Forêt torturée. Les cadrages ne peuvent être ni
déplacés ni zoomés. Chaque joueur verrouille une seule balise et peut obtenir jusqu’à 1 000 points.

Les trois propositions et le champion sélectionné utilisent un canal privé vers la socket du
dessinateur. `PublicRoomState` ne contient ni identifiant, ni nom, ni portrait secret pendant
`CHOOSING` ou `DRAWING`. Le champion n’entre dans l’état public qu’au récapitulatif.

## Règles de score

Le score d’un devineur est centralisé dans `scoring.ts` : 100 points de participation, jusqu’à 700
points selon le temps restant et un bonus de placement de 250 points, diminué de 75 par position.
Le résultat est borné à zéro. Le dessinateur reçoit 75 points par adversaire ayant trouvé et zéro
si personne ne trouve. Les fonctions sont pures et testées.

Une manche correspond à un cycle complet : chacun des joueurs présents au lancement dessine ou
imite une fois. Avec deux joueurs et trois manches, la partie contient donc six tours.

La révélation automatique est plafonnée selon le nombre de lettres du champion : aucun indice pour
deux lettres, un pour trois lettres, deux pour quatre ou cinq lettres, puis un indice supplémentaire
par tranche de deux lettres, sans jamais dépasser cinq lettres révélées.

La toile propose un pinceau, une gomme et un seau de remplissage par zone : un clic à l’intérieur
d’un contour fermé colore uniquement son intérieur, tandis qu’un clic à l’extérieur colore le fond
contigu. Chaque geste, y compris un remplissage, peut être annulé et rétabli.

Une ambiance originale de piano doux, accord chaleureux et réverbération accompagne l’accueil et le
lobby après la première interaction avec la page. Elle s’arrête pendant la partie et respecte le
bouton d’activation du son.

## Données de champions

Le serveur charge la version courante et la liste française depuis Riot Data Dragon, puis construit
les URL de portraits officielles. Le résultat est mis en cache. En cas d’indisponibilité réseau, le
catalogue local complet en version 16.16.1 et des URL Data Dragon versionnées assurent le
fonctionnement du MVP. Les propositions sont tirées dans un paquet aléatoire sans répétition avant
son épuisement. La
variable `DISABLED_CHAMPION_IDS` accepte une liste d’identifiants séparés par des virgules.

Le mode « Imitation vocale » couvre le catalogue complet et permet à l’hôte de choisir les répliques
de sélection françaises ou anglaises. Les extraits localisés sont chargés depuis les fichiers du
client League archivés par CommunityDragon à partir de l’identifiant numérique Riot du champion.
L’extrait n’est envoyé qu’au joueur actif ; ni le champion, ni le texte, ni l’URL audio n’apparaissent
dans l’état public. Une connexion Internet est donc requise pour l’audio. Lorsqu’une transcription
fiable est disponible, elle apparaît après cinq secondes ; sinon l’interface demande explicitement
de réécouter puis d’imiter l’extrait, sans inventer de faux sous-titre. Le mode peut transmettre le
micro directement entre navigateurs avec WebRTC : seul le protocole de connexion transite par le
serveur, pas le flux audio. L’imitateur doit appuyer sur « Activer mon micro » à chaque tour. Sur
téléphone, les navigateurs exigent une origine HTTPS pour autoriser le micro ; sur une adresse HTTP
locale, l’interface l’explique et un appel vocal externe reste nécessaire.

## Robustesse et sécurité du MVP

- validation Zod de chaque événement entrant et liste stricte d’événements ;
- limitation du chat à 5 messages/5 s et du dessin à 300 segments/s ;
- codes générés avec `crypto.randomBytes`, pseudonymes et messages bornés ;
- texte utilisateur rendu comme texte par React, sans injection HTML ;
- état et chronomètres autoritaires côté serveur ;
- reconnexion par UUID local pendant une fenêtre configurable ;
- transfert de l’hôte au joueur connecté le plus ancien ;
- fin immédiate de la manche au départ du dessinateur et fermeture des salons vides ;
- journalisation sans nommer le champion secret et CORS configurable.

Ces mesures réduisent les risques courants mais ne constituent pas une garantie de sécurité. Une
mise en production demanderait notamment un stockage partagé, une limite distribuée, une politique
de proxy et de logs, une supervision et des tests de charge.

## Limites du MVP

- salons et sessions uniquement en mémoire : un redémarrage du serveur les efface ;
- une seule instance serveur, sans Redis ni répartition de charge ;
- aucun compte, modération avancée ou persistance du classement ;
- certaines répliques localisées ne disposent pas encore d’une transcription écrite fiable ;
- le canal WebRTC utilise un serveur STUN public mais pas encore de serveur TURN, donc certains
  réseaux restrictifs peuvent nécessiter un appel vocal externe ;
- HexaMap utilise des vues 2D fixes issues des minimaps ; des captures en jeu plus détaillées
  pourraient enrichir ultérieurement les lieux ;
- la reconnexion restaure la partie, mais un dessinateur déconnecté termine sa manche immédiatement ;
- le protocole ne compresse pas encore les segments en lots binaires.

Les prochaines évolutions naturelles sont un repository Redis, des rooms multi-instance, une
modération configurable, des métriques, des tests de charge, une meilleure reprise de session et
des moteurs de modes branchés sur la même machine à états.

Les effets sonores sont synthétisés localement avec Web Audio : aucun fichier audio tiers n’est
téléchargé. Le joueur peut les couper depuis l’en-tête et cette préférence reste mémorisée dans son
navigateur.

## Riot Games et publication

La mention de pied de page est configurable avec `RIOT_LEGAL_TEXT`. Avant toute publication, le
créateur doit relire les politiques Riot les plus récentes, vérifier si le produit doit être
enregistré sur le Riot Developer Portal, le soumettre si les règles alors applicables l’exigent,
et vérifier séparément toute utilisation de voice lines ou fichiers audio. Le produit ne doit
jamais laisser entendre que Riot l’approuve, l’édite ou le soutient. Les extraits du mode vocal
restent la propriété de Riot Games et sont accompagnés d’un lien vers leur page source.

Cette section décrit des précautions de projet et ne constitue pas un avis juridique.
