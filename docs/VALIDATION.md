# Validation de la livraison 0.4.0

Validation locale réalisée le 21 octobre 2026, sous Windows avec Node.js 24.19.0, TypeScript 5.9.3, Vite 7.3.7, Python 3.12.14, Primer3-py 2.3.1 et Chromium Headless via Playwright 1.64.0.

## Résultats

- Vérification TypeScript strict : réussie.
- Compilation Vite : réussie.
- Tests TypeScript/Node : 56 réussis (cœur scientifique, formats, HTTP, SQLite, migrations, recherche, annotations, gels et protocole IA).
- Tests Python : 7 réussis, dont la valeur numérique de référence publiée par Primer3-py.
- 12 parcours navigateur réussis : création de projet ; création/édition/rechargement de séquence ; erreurs ADN, annulation et recherche ; sélection et annotations superposées ; suivi des annotations après édition, annulation, complément inverse et rechargement ; bibliothèque/doublons ; calcul Primer3 et modification des paramètres ; import/export FASTA ; import CSV et archivage ; préférences/export de sauvegarde ; recherche globale/suppression de projet/restauration ; présentation responsive et thèmes.
- 5 parcours navigateur supplémentaires réussis : recherche longue, absente, invalide, répétée et sur le complément inverse ; aperçu des sources Up/Down/Amorce, ajout, enregistrement et dédoublonnage ; complément inverse/annulation, export et modification de la fiche source ; suppression de sources et sauvegarde/restauration sans perte des copies ; présentation mobile des panneaux et de la fiche source. Total : **17 parcours**.
- Aucune erreur JavaScript d'exécution observée dans ces parcours.
- 8 parcours Notes/Gels/Assistant réussis : image originale et pistes égales ; légendes/amorces/Primer3 ; contours et historique ; exports PNG/CSV ; notes, copie et PDF ; contexte IA et récupération d'erreur ; sauvegarde/restauration ; présentation mobile. Total général : **25 parcours**.
- Largeurs vérifiées : 1440, 1080 et 390 pixels. Absence de débordement horizontal de la page d'accueil, de l'éditeur annoté et de la fenêtre source sur mobile. Les tableaux et vues de séquences disposent de défilement interne.

Les captures de tests restent dans artifacts/, hors Git. Les parcours travaillent uniquement sur des données artificielles et un dossier SQLite temporaire. La base de travail utilisateur n'est pas utilisée pour les tests.

Le rapport PDF A4 de test a été rendu avec Poppler et inspecté visuellement. Les parcours de l'assistant utilisent des réponses contrôlées : source choisie, citation, conservation dans Notes et erreur de crédit. Les tests de service vérifient le format Responses, `store: false`, l'exclusion des séquences génomiques et le traitement des erreurs. Ils ne constituent pas une preuve de réponse générée en production : une clé et un crédit API disponibles restent nécessaires.

La migration SQLite v3 vers v4 est également vérifiée avec une base temporaire, une sauvegarde intacte du modèle précédent et la conservation du numéro de révision. Les tests Gels couvrent l'intégrité des images, les coordonnées hors piste et les copies d'amorces dont la fiche a été supprimée.

## Portée

Ces vérifications attestent des fonctions présentes et des modèles appelés ; elles ne constituent pas une validation expérimentale des oligonucléotides. Elles ne couvrent pas les modules futurs ni un installateur natif.

Le workflow GitHub Actions est fourni pour les prochaines modifications. Une configuration de workflow n'est pas, à elle seule, une preuve d'exécution distante.

## Choix techniques

Node.js et son SQLite intégré permettent un MVP local sans compilation Rust. Le serveur protège ses routes par contrôle Host/Origin, limite le corps des requêtes et les tailles des entrées, refuse les références de projet absentes et sérialise les écritures dans une transaction.

Le contrôle de révision empêche une fenêtre ancienne d'écraser silencieusement un enregistrement plus récent. En cas de conflit, l'utilisateur doit conserver/copier ses modifications puis recharger l'espace avant de les réappliquer.

La sauvegarde JSON comprend le modèle complet et une empreinte SHA-256. L'empreinte détecte les altérations accidentelles ; elle n'est pas une signature cryptographique d'un tiers. Une restauration valide écrit une sauvegarde de l'espace précédent avant son remplacement.

La pagination limite le DOM de la vue colorée à 12 lignes. L'édition texte et les statistiques travaillent encore sur le document complet : aucune promesse de performance interactive sur des génomes de plusieurs mégabases.

Les migrations sont vérifiées à partir de véritables bases SQLite v1 et v2 : données, annotations, préférences et révision conservées, fichier de récupération identique au modèle d'origine, réouverture sans seconde migration. Les sauvegardes anciennes sont contrôlées avant conversion ; une empreinte altérée, un schéma futur, des annotations hors limites ou une référence vers une copie source absente sont refusés.

Les tests d'annotations couvrent les insertions aux bornes, éditions internes, suppressions complètes, motifs répétés, chevauchements et complément inverse. Les coordonnées exactes fournies par l'édition du navigateur évitent de déduire le mauvais emplacement dans une suite de bases répétées ; un diff contigu sert de repli. Une région touchée doit être vérifiée par l'utilisateur.

La recherche est comparée à une référence naïve sur 150 cas déterministes. Une cible répétitive de 1 000 000 de bases et un motif de 100 000 bases produisent les 900 001 correspondances attendues, avec une liste conservée bornée. Les cas palindromiques, lettres ambiguës littérales, sources absentes, aperçus tronqués, versions de source et doublons sont couverts.
