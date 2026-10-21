# GeneForge — Molecular Design Workspace

Version **0.4.0**, en français, pour travailler sur des séquences ADN, une bibliothèque d'amorces, des notes et des gels.

## Démarrer sur cet ordinateur

Double-cliquer sur **Lancer GeneForge.cmd**, puis ouvrir **http://127.0.0.1:4173** si le navigateur ne s'ouvre pas automatiquement.

L'application utilise un petit serveur Node.js local et une base SQLite dans le dossier **data/**. Fermer l'onglet ne ferme pas ce serveur ; **Arreter GeneForge.cmd** l'arrête. Les modules de travail fonctionnent hors ligne après installation. L'assistant optionnel utilise l'API OpenAI, une connexion Internet et une facturation API séparée.

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

### Nouveautés 0.4.0

- **Notes** : texte libre, références de fichiers sur serveur, gels associés, lien vers e-Lab LIPME, copie pour e-Lab et aperçu d'impression PDF.
- **Gels** : image originale conservée, recadrage, pistes égales numérotées, légendes latérales, amorces liées avec copie de leur séquence, contours colorés manuels, profils de pixels et exports PNG/CSV/PDF.
- **Assistant IA** : sources choisies et consultables avant envoi, images de gels facultatives, réponses copiables et conservables dans Notes. Clé OpenAI côté serveur et crédit API requis.

Voir [le guide Notes, Gels et Assistant](docs/NOTES-GELS-IA.md) pour les opérations, les limites et le réglage du modèle. Le studio est une implémentation GeneForge ; GelAnalyzer n'est pas embarqué. Le lien e-Lab ouvre votre instance, sans synchronisation ou écriture automatique.

### Limites explicites

- Les cartes plasmidiques, traductions, design automatique d'amorces, alignements Biopython, chromatogrammes AB1, enzymes et imports GenBank/XLSX ne sont pas encore implémentés.
- Aucun calcul de hairpin, dimère, masse moléculaire ou spécificité n'est affiché comme disponible.
- Un seul profil local et un seul document édité à la fois ; pas encore de corbeille ou d'historique de versions des documents.
- L'éditeur demande **Enregistrer / Ctrl+S**. Un avertissement protège les modifications non enregistrées lors de la navigation et de la fermeture ; il n'y a pas de récupération automatique des brouillons.
- Les sauvegardes complètes se déclenchent manuellement. Une copie automatique est créée avant toute restauration, pas à chaque modification.
- SQLite contient un instantané JSON validé de l'espace et un numéro de révision. Les relations sont contrôlées par la couche métier ; leur normalisation en tables relationnelles est une évolution prévue.
- Limites : 1 000 000 de bases et 2 000 annotations par séquence, 2 000 bases par entrée d'amorce, requête/backup 16 Mio. L'espace entier est chargé en mémoire ; cette version n'est pas un navigateur de génomes complets. Le rendu coloré est paginé, pas un éditeur intégralement virtualisé.
- FASTA conserve nom et séquence ; CSV conserve nom, séquence, notes et tags. Utiliser la sauvegarde native pour préserver toutes les métadonnées, associations, dates et préférences.

## Sélections, surlignages et personnalisation

- Sélectionner du texte dans l'éditeur, glisser sur les bases de la vue colorée ou saisir un début et une fin. Les coordonnées commencent à 1 et incluent les deux bornes. Dans la vue colorée, les flèches déplacent la sélection ; Maj + flèches l'étend, Ctrl+A sélectionne tout et Ctrl+C copie les bases.
- Le panneau **Sélection** affiche la longueur, la fraction du document et les effectifs et pourcentages A/T/G/C/IUPAC. Les pourcentages par catégorie utilisent toute la sélection ; GC/AT utilisent uniquement les bases canoniques. Un résumé apparaît aussi sous la séquence.
- **Surligner la sélection** crée une annotation avec titre, couleur et notes. Les régions peuvent se chevaucher : leurs couleurs se partagent alors le fond des bases. Le survol affiche les informations ; la liste permet de retrouver, modifier et supprimer les annotations. Un clic sur leur titre sélectionne la région.
- Les insertions et suppressions déplacent les annotations. Une modification qui touche une région la marque **À vérifier**. Si toute la région est supprimée, ses informations restent dans la liste, sans coordonnées, et peuvent être réaffectées. Le complément inverse transforme les coordonnées. L'annulation et le rétablissement incluent les annotations.
- **Enregistrer / Ctrl+S** conserve la séquence et ses annotations. FASTA ne stocke pas les surlignages : utiliser la sauvegarde complète pour les conserver et les transférer.
- Dans **Préférences & sauvegardes** : thème, quatre accents, densité confortable/compacte, taille des bases de 12 à 22 px, trois palettes, espacement par groupes de dix, bases par ligne et vue par défaut. Enregistrer les préférences les applique à l'espace ; un aperçu montre les bases avant enregistrement.

## Recherche et annotation automatique

Dans une séquence ouverte, coller le fragment dans **Rechercher dans cette séquence** (Ctrl+F). La recherche indique le nombre de correspondances ou leur absence, surligne les bases en doré et permet de passer d'une occurrence à l'autre, même entre pages. L'option **Chercher aussi le complément inverse** ajoute l'autre sens. Le surlignage de recherche est temporaire.

Pour annoter à partir de fragments ou d'amorces :

1. Importer les fragments FASTA dans un projet et les amorces FASTA/CSV/TSV dans la bibliothèque.
2. Ouvrir la séquence cible puis **Annotation automatique → Choisir des fragments ou amorces**.
3. Choisir les sources et leur catégorie **Up**, **Down**, **Amorce** ou **Fragment**. Les deux sens sont recherchés par défaut.
4. Cliquer sur **Analyser les sources choisies**. L'aperçu montre les positions trouvées et les fragments absents.
5. Cliquer sur **Ajouter les annotations trouvées**, puis **Enregistrer / Ctrl+S**. Les doublons déjà présents sont ignorés ; couleurs, titres et notes restent modifiables.

Chaque annotation automatique indique le sens trouvé et propose un bouton **Source**. Celui-ci ouvre une copie conservée de la séquence source, ses notes et son nom de fichier d'import lorsqu'il est connu. Il permet d'exporter cette copie en FASTA ou d'ouvrir la fiche d'origine après enregistrement. La copie reste disponible si la fiche d'origine est modifiée ou supprimée, et fait partie des sauvegardes complètes. Le fichier original lui-même et son chemin sur le disque ne sont pas archivés ; les anciens imports ne disposent pas rétroactivement de leur nom de fichier.

Les correspondances portent sur le fragment entier, sans mismatch ni correspondance partielle. Les lettres ambiguës IUPAC sont littérales : `N` correspond à `N` uniquement. Une séquence identique à son complément inverse compte une seule fois par position. Up et Down sont des catégories choisies, sans déduction automatique de fonction biologique ou de cadre de lecture.

La recherche accepte les fragments jusqu'à la limite du document de 1 000 000 de bases et compte toutes les occurrences ; elle en affiche au maximum 5 000. Une analyse automatique accepte 200 sources et 2 000 correspondances au total. Si l'aperçu dépasse cette limite, l'ajout est désactivé pour éviter une annotation partielle : réduire les sources ou choisir des fragments plus longs. Les calculs de recherche s'exécutent dans un worker local pouvant être interrompu.

Une recherche ou annotation ne traverse pas l'origine d'une séquence circulaire. Créer deux annotations manuelles si nécessaire.

### Mise à jour depuis 0.1.0, 0.2.0 ou 0.3.0

Arrêter GeneForge avant de lancer la nouvelle version. Au premier démarrage, les modèles SQLite 1, 2 ou 3 passent automatiquement en version 4, en conservant les données, annotations et préférences existantes. Une sauvegarde intacte du modèle précédent est créée dans `data/backups/before-migration-v4-…geneforge.json`. Les anciennes sauvegardes restent importables ; leur intégrité est vérifiée avant migration. Les nouvelles sauvegardes incluent les notes, images et liens des gels.

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

Le serveur écoute uniquement sur 127.0.0.1. Les routes vérifient l'hôte, l'origine et les données JSON. Les écritures sont transactionnelles et les imports n'exécutent pas de code. Il n'existe aucune télémétrie. L'envoi à OpenAI se déclenche uniquement depuis l'assistant avec les sources sélectionnées ; les autres modules travaillent localement.

L'application n'est pas destinée à être exposée directement sur un réseau. La base locale n'est pas chiffrée : elle bénéficie des protections du compte Windows et du disque. Les dépendances, la base, les sauvegardes et les captures de test sont exclues du dépôt Git.

Pour déplacer l'espace : exporter une sauvegarde depuis Préférences, la copier sur la nouvelle machine, puis la restaurer. Éviter de copier uniquement le fichier SQLite lorsqu'un serveur fonctionne, car les données récentes peuvent se trouver dans son journal WAL.

## Références et dépendances

Les conventions de calcul et sources sont détaillées dans [docs/SCIENCE.md](docs/SCIENCE.md). L'intégration utilise [Primer3-py](https://libnano.github.io/primer3-py/) et le [manuel Primer3](https://primer3.org/manual.html). Les alignements seront ajoutés avec [Biopython PairwiseAligner](https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html).

Les bibliothèques conservent leurs licences respectives. Primer3/Primer3-py est distribué sous GPL ; son paquet est installé séparément et n'est pas copié dans ce dépôt. Les versions JavaScript exactes sont figées dans pnpm-lock.yaml, et celle de Primer3 dans requirements-science.txt.
