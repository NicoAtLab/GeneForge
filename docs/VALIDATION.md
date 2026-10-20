# Validation de la livraison 0.1.0

Validation locale réalisée le 14 octobre 2026, sous Windows avec Node.js 24.19.0, TypeScript 5.9.3, Vite 7.3.7, Python 3.12.14, Primer3-py 2.3.1 et Chromium Headless via Playwright 1.64.0.

## Résultats

- Vérification TypeScript strict : réussie.
- Compilation Vite : réussie.
- Tests TypeScript/Node : 29 réussis (cœur scientifique, formats, HTTP et SQLite).
- Tests Python : 7 réussis, dont la valeur numérique de référence publiée par Primer3-py.
- 10 parcours navigateur réussis : création de projet ; création/édition/rechargement de séquence ; erreurs ADN, annulation et recherche ; bibliothèque/doublons ; calcul Primer3 et modification des paramètres ; import/export FASTA ; import CSV et archivage ; préférences/export de sauvegarde ; recherche globale/suppression de projet/restauration ; présentation responsive et thèmes.
- Aucune erreur JavaScript d'exécution observée dans ces parcours.
- Largeurs vérifiées : 1440, 1080 et 390 pixels. Absence de débordement horizontal de la page d'accueil. Les tableaux et vues de séquences disposent de défilement interne.

Les captures de tests restent dans artifacts/, hors Git. Les parcours travaillent uniquement sur des données artificielles et un dossier SQLite temporaire. La base de travail utilisateur n'est pas utilisée pour les tests.

## Portée

Ces vérifications attestent des fonctions présentes et des modèles appelés ; elles ne constituent pas une validation expérimentale des oligonucléotides. Elles ne couvrent pas les modules futurs ni un installateur natif.

Le workflow GitHub Actions est fourni pour les prochaines modifications. Une configuration de workflow n'est pas, à elle seule, une preuve d'exécution distante.

## Choix techniques

Node.js et son SQLite intégré permettent un MVP local sans compilation Rust. Le serveur protège ses routes par contrôle Host/Origin, limite le corps des requêtes et les tailles des entrées, refuse les références de projet absentes et sérialise les écritures dans une transaction.

Le contrôle de révision empêche une fenêtre ancienne d'écraser silencieusement un enregistrement plus récent. En cas de conflit, l'utilisateur doit conserver/copier ses modifications puis recharger l'espace avant de les réappliquer.

La sauvegarde JSON comprend le modèle complet et une empreinte SHA-256. L'empreinte détecte les altérations accidentelles ; elle n'est pas une signature cryptographique d'un tiers. Une restauration valide écrit une sauvegarde de l'espace précédent avant son remplacement.

La pagination limite le DOM de la vue colorée à 12 lignes. L'édition texte et les statistiques travaillent encore sur le document complet : aucune promesse de performance interactive sur des génomes de plusieurs mégabases.
