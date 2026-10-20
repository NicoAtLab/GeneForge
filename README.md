# GeneForge — Molecular Design Workspace

Première version fonctionnelle **0.1.0**, en français, pour travailler localement sur des séquences ADN, une bibliothèque d'amorces et des projets.

## Démarrer sur cet ordinateur

Double-cliquer sur **Lancer GeneForge.cmd**, puis ouvrir **http://127.0.0.1:4173** si le navigateur ne s'ouvre pas automatiquement.

L'application utilise un petit serveur Node.js local et une base SQLite dans le dossier **data/**. Fermer l'onglet ne ferme pas ce serveur ; **Arreter GeneForge.cmd** l'arrête. Aucun compte distant ni accès Internet n'est requis après installation.

L'interface est exécutée dans le navigateur. Cette livraison n'est pas encore un exécutable Tauri ni un installateur Windows autonome.

## Fonctions livrées

| Module                 | Fonctions opérationnelles                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projets                | Création, modification du nom et de la description, couleur, épinglage, suppression confirmée et filtrage des séquences par projet.                                                                             |
| Éditeur ADN            | Création, édition, enregistrement manuel, annuler/rétablir, recherche exacte, sélection avec coordonnées, copie, copie du complément, complément inverse, topologie, composition, GC/AT et vue colorée paginée. |
| Fichiers de séquence   | Import multi-enregistrements FASTA avec aperçu et validation ; export FASTA individuel ou filtré. Les brouillons vides ne sont pas exportés.                                                                    |
| Bibliothèque d'amorces | Création, modification, détection de doublons de séquence, favoris, archivage/restauration, tags, notes, rôles, association à plusieurs projets, recherche et tri.                                              |
| Collections            | Import CSV, TSV et FASTA avec aperçu ; doublons ignorés ; sélection multiple et export CSV.                                                                                                                     |
| Analyseur d'oligos     | Composition IUPAC, compléments, homopolymères, estimation Wallace et **Tm réelle avec Primer3-py 2.3.1**, modèles SantaLucia explicites et concentrations modifiables.                                          |
| Sauvegardes            | Écritures SQLite transactionnelles, détection de concurrence entre fenêtres, export complet JSON avec SHA-256, restauration validée et copie préalable de l'ancien espace.                                      |
| Préférences            | Profil local, organisation, thème sombre/clair/système, bases par ligne, recherche globale Ctrl+K.                                                                                                              |

Les données artificielles de démonstration sont créées uniquement en cliquant sur « Explorer un exemple ». Aucune annotation biologique n'est déduite des noms.

### Limites explicites

- Les cartes plasmidiques, annotations, traductions, design automatique d'amorces, alignements Biopython, chromatogrammes AB1, enzymes, import GenBank/XLSX et exports graphiques ne sont pas encore implémentés.
- Aucun calcul de hairpin, dimère, masse moléculaire ou spécificité n'est affiché comme disponible.
- Un seul profil local et un seul document édité à la fois ; pas encore de corbeille ou d'historique de versions des documents.
- L'éditeur demande **Enregistrer / Ctrl+S**. Un avertissement protège les modifications non enregistrées lors de la navigation et de la fermeture ; il n'y a pas de récupération automatique des brouillons.
- Les sauvegardes complètes se déclenchent manuellement. Une copie automatique est créée avant toute restauration, pas à chaque modification.
- SQLite contient un instantané JSON validé de l'espace et un numéro de révision. Les relations sont contrôlées par la couche métier ; leur normalisation en tables relationnelles est une évolution prévue.
- Limites : 1 000 000 de bases par séquence, 2 000 par entrée d'amorce, requête/backup 16 Mio. L'espace entier est chargé en mémoire ; cette version n'est pas un navigateur de génomes complets. Le rendu coloré est paginé, pas un éditeur intégralement virtualisé.
- FASTA conserve nom et séquence ; CSV conserve nom, séquence, notes et tags. Utiliser la sauvegarde native pour préserver toutes les métadonnées, associations, dates et préférences.

## Installation sur une autre machine

Prérequis : Node.js **24 ou plus récent**, pnpm **11.25.0**, et Python **3.12** pour le moteur Primer3. La compilation native Rust n'est pas nécessaire.

Sous Windows, **Installer GeneForge.cmd** installe les dépendances et compile l'interface. Une connexion Internet est requise pour cette installation initiale. Le script ne modifie pas les préférences du système ni la politique PowerShell globale.

Installation manuelle depuis la racine :

    pnpm install --frozen-lockfile
    python -m pip install --target .python-deps --only-binary=:all: -r requirements-science.txt
    pnpm run build
    pnpm start

Configurer **GENEFORGE_PYTHON** avec le chemin de l'interpréteur si nécessaire. Le serveur cherche d'abord cet interpréteur, puis le Python embarqué du poste de développement s'il existe, puis python.exe sur Windows ou python3 ailleurs. Primer3 n'est jamais téléchargé pendant un calcul.

Sans Primer3, l'édition, les projets, les bibliothèques et les statistiques restent disponibles. Le calcul avancé présente alors une erreur explicite, sans valeur de remplacement.

## Développement

Deux terminaux :

    pnpm start
    pnpm dev

Le serveur de développement Vite relaie /api au serveur local 127.0.0.1:4173. Pour une utilisation normale, compiler puis ouvrir le port 4173.

Architecture :

    src/components/        Interface React
    src/core/              Calculs purs, formats, adaptateur Python Primer3
    src/types.ts           Modèle de données versionné
    server/                HTTP local, validation, SQLite, processus scientifique
    tests/                 Tests scientifiques, stockage et parcours navigateur
    scripts/               Installation, lancement et arrêt sous Windows
    docs/                  Modèles, limites, architecture et validation

TypeScript strict, React, Vite et CSS local ; aucune police ni bibliothèque n'est chargée depuis un CDN à l'exécution. Le processus Python est lancé à la demande, avec délai d'expiration et données transmises sur stdin. Aucun serveur Python permanent.

## Vérifications

    pnpm run build
    pnpm test
    python tests/primer3_test.py
    pnpm exec playwright install chromium --only-shell
    pnpm run test:e2e

Les tests navigateur utilisent un profil isolé et une base temporaire, supprimée à la fin. Ils n'utilisent pas les projets du dossier data/. Les captures sont enregistrées dans artifacts/ et exclues de Git. Le workflow GitHub Actions reproduit les vérifications sur Windows et Linux.

Voir [le rapport de validation](docs/VALIDATION.md) et [les modèles scientifiques](docs/SCIENCE.md).

## Données et confidentialité

Le serveur écoute uniquement sur 127.0.0.1. Les routes vérifient l'hôte, l'origine et les données JSON. Les écritures sont transactionnelles et les imports n'exécutent pas de code. Il n'existe aucune télémétrie ni transmission automatique des séquences.

L'application n'est pas destinée à être exposée directement sur un réseau. La base locale n'est pas chiffrée : elle bénéficie des protections du compte Windows et du disque. Les dépendances, la base, les sauvegardes et les captures de test sont exclues du dépôt Git.

Pour déplacer l'espace : exporter une sauvegarde depuis Préférences, la copier sur la nouvelle machine, puis la restaurer. Éviter de copier uniquement le fichier SQLite lorsqu'un serveur fonctionne, car les données récentes peuvent se trouver dans son journal WAL.

## Références et dépendances

Les conventions de calcul et sources sont détaillées dans [docs/SCIENCE.md](docs/SCIENCE.md). L'intégration utilise [Primer3-py](https://libnano.github.io/primer3-py/) et le [manuel Primer3](https://primer3.org/manual.html). Les alignements seront ajoutés avec [Biopython PairwiseAligner](https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html).

Les bibliothèques conservent leurs licences respectives. Primer3/Primer3-py est distribué sous GPL ; son paquet est installé séparément et n'est pas copié dans ce dépôt. Les versions JavaScript exactes sont figées dans pnpm-lock.yaml, et celle de Primer3 dans requirements-science.txt.
