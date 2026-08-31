# Événements Socket.IO

Tous les événements entrants sont validés par Zod. Les acquittements prennent la forme
`{ ok: true, ... }` ou `{ ok: false, error }`.

## Client vers serveur

| Événement         | Charge utile                                                     | Autorisation / effet                                       |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `create_room`     | `{ nickname, sessionId }`                                        | Crée un salon et désigne l’hôte.                           |
| `join_room`       | `{ code, nickname, sessionId }`                                  | Rejoint un lobby ou reconnecte la même session.            |
| `leave_room`      | `{}`                                                             | Quitte explicitement le salon.                             |
| `set_ready`       | `{ ready }`                                                      | Change l’état prêt dans le lobby.                          |
| `update_settings` | `{ mode, voiceLanguage, rounds, roundDuration, revealInterval }` | Hôte uniquement, dans le lobby.                            |
| `start_game`      | `{}`                                                             | Hôte uniquement, au moins deux joueurs et invités prêts.   |
| `choose_champion` | `{ championId }`                                                 | Joueur actif uniquement, parmi ses trois choix privés.     |
| `draw_segment`    | `DrawSegment`                                                    | Dessinateur uniquement, limité à 300 événements/s.         |
| `canvas_action`   | `{ action }`                                                     | `undo`, `redo` ou `clear`, dessinateur uniquement.         |
| `chat_message`    | `{ message }`                                                    | Devineur n’ayant pas encore trouvé, 160 caractères, 5/5 s. |
| `play_again`      | `{}`                                                             | Hôte uniquement après la partie.                           |
| `voice_signal`    | `{ targetPlayerId, signal }`                                     | Négociation WebRTC avec l’imitateur.                       |
| `map_guess`       | `{ x, y }`                                                       | Verrouille une balise normalisée en mode HexaMap.          |

Un `DrawSegment` contient un identifiant, deux points `{ x, y }` normalisés entre 0 et 1,
une couleur hexadécimale, une épaisseur entre 1 et 40 et l’outil `brush` ou `eraser`.

## Serveur vers client

| Événement              | Contenu                                | Remarque                                                  |
| ---------------------- | -------------------------------------- | --------------------------------------------------------- |
| `room_state`           | `PublicRoomState`                      | État public autoritaire ; aucun secret pendant la manche. |
| `private_drawer_state` | choix, champion et éventuelle réplique | Envoyé uniquement à la socket du joueur actif.            |
| `draw_segment`         | segment validé                         | Permet la réplication compacte du tracé.                  |
| `canvas_state`         | tableau de segments                    | Reconstruction après connexion, annulation ou effacement. |
| `chat_entry`           | message texte ou annonce de réussite   | Une bonne réponse n’est jamais publiée.                   |
| `error_message`        | texte                                  | Erreur d’action non acquittée.                            |
| `voice_signal`         | `{ id, fromPlayerId, signal }`         | Relais privé WebRTC ; le flux audio reste pair-à-pair.    |

Le serveur conserve l’historique des segments dans le salon en mémoire. Le client n’envoie jamais
de capture de la toile. En mode `voice`, l’état privé contient aussi `voiceLine` et
`voiceTextRevealAt`; ces champs ne sont jamais copiés dans `PublicRoomState`.

En mode `map`, `PublicRoomState.mapChallenge` contient la carte et le cadrage fixe de la manche.
Les balises restent côté serveur jusqu’au résultat, puis `RoundResult` expose la solution, les
positions, la distance normalisée et les points de chaque joueur.
