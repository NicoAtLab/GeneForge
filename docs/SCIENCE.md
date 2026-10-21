# Modèles scientifiques et formats de GeneForge

Ce MVP travaille sur de l'ADN écrit de 5′ vers 3′. Les calculs de composition, la complémentation et la recherche textuelle sont déterministes et testés. La Tm avancée provient du moteur local Primer3-py ; aucune formule thermodynamique maison ne remplace ce moteur.

## Séquences et coordonnées

- Alphabet accepté : `ACGTRYSWKMBDHVN`. `U`, les gaps, les chiffres, les caractères non ASCII et les symboles non IUPAC sont signalés, jamais supprimés silencieusement.
- La normalisation supprime uniquement les espaces et convertit les lettres ASCII en majuscules. Les positions sont comptées à partir de 1 dans cette séquence normalisée.
- Limite applicative : 1 000 000 de caractères normalisés par séquence. Une séquence vide est admise dans les fonctions de base pendant l'édition ; elle est refusée à l'import/export d'un enregistrement.
- Le complément conserve l'ordre et s'affiche donc 3′→5′ ; le complément inverse s'affiche 5′→3′. Les couples ambigus sont `R↔Y`, `K↔M`, `B↔V`, `D↔H` ; `S`, `W` et `N` sont invariants.
- La recherche de motifs est littérale, insensible à la casse, avec chevauchements. `N` ne correspond qu'à la lettre `N` ; les ambiguïtés ne sont pas développées. L'option complément inverse ajoute l'autre sens ; elle est activée par défaut pour l'annotation automatique. Un fragment identique à son complément inverse est compté une seule fois par position, avec un sens `±`. Un motif vide invite à saisir une séquence.
- L'algorithme KMP parcourt la cible en temps linéaire par motif et par sens, dans un worker local. Les occurrences sont toutes comptées, mais seules 5 000 sont conservées pour l'affichage d'une recherche. L'annotation automatique impose un aperçu complet, limité à 200 sources et 2 000 correspondances par analyse. Aucune recherche ne traverse l'origine circulaire.

## Composition

`%GC = 100 × (G+C)/(A+C+G+T)` et `%AT = 100 × (A+T)/(A+C+G+T)`. Les caractères ambigus sont exclus du dénominateur et leur nombre reste affiché. Le compteur `ambiguous` comprend `N` ; `n` en donne le sous-total. Si aucune base canonique n'est présente, les pourcentages valent `null`, jamais 0 par convention implicite. Il ne s'agit pas d'une estimation pondérée de la composition des bases ambiguës.

Les homopolymères signalés sont les segments maximaux d'au moins quatre bases canoniques identiques. Un segment `NNNN` n'est pas présenté comme un homopolymère biologique connu. Ce comptage n'est pas un calcul de dimère, de hairpin ou de spécificité.

Les mêmes calculs s'appliquent à la sélection. Les pourcentages individuels A/T/G/C/ambiguës utilisent la longueur totale de la région, tandis que GC/AT gardent le dénominateur canonique décrit ci-dessus. La part du document est `100 × longueur sélectionnée / longueur totale`. Les arrondis affichés à une décimale peuvent entraîner une somme légèrement différente de 100 %.

## Annotations personnelles

Les intervalles sont à bornes incluses, de 1 à la longueur de la séquence normalisée. Les blancs ne comptent pas comme bases. Une annotation enregistre un nom, une couleur, des notes et une catégorie ; elle ne déclare aucune fonction biologique automatiquement.

Les insertions au début d'une région décalent cette région ; les insertions après sa dernière base ne l'étendent pas. Une édition interne ajuste ses bornes et active un indicateur de vérification. Une région entièrement supprimée conserve ses informations avec des coordonnées nulles. Le complément inverse transforme `[début, fin]` en `[L − fin + 1, L − début + 1]` et échange les sens `+` et `−` ; `±` reste inchangé. Une annotation manuelle n'a pas de sens déterminé. Une région ne peut pas traverser l'origine circulaire.

L'annotation automatique reconnaît exactement le fragment source entier ou son complément inverse, sans mismatch, alignement partiel ni tolérance aux gaps. Les catégories Up, Down, Amorce et Fragment sont choisies par l'utilisateur ; elles ne déterminent pas le sens trouvé. Chaque occurrence ajoutée conserve une référence vers une copie de la source (séquence, nom, notes, nom du fichier d'import connu et date de capture). Cette copie est partagée entre les annotations d'une même version de source dans un document. Elle reste disponible après modification ou suppression de la fiche d'origine. Le fichier original n'est pas conservé ; l'export de la copie reconstruit un FASTA. La sauvegarde native conserve toutes ces relations.

## Images de gels

Les profils et mesures utilisent les pixels RGB décodés par le navigateur, sans retoucher l'original. Le signal est `0,2126 R + 0,7152 G + 0,0722 B` pour un fond noir, ou `255 − signal` pour un fond blanc. Les canaux restent dans leur espace d'affichage encodé ; aucune linéarisation ou transformation en densité optique n'est appliquée. Les pixels transparents sont composés sur le fond choisi.

Un profil est la moyenne des colonnes de la piste pour chaque ligne. La mesure d'une ellipse inclut les pixels dont le centre se trouve dans son contour ; elle donne effectif, moyenne, somme et proportion de signaux au moins égaux à 254,5 sur 255. Ce dernier indicateur porte sur les pixels décodés, pas sur la saturation physique du capteur. Il n'y a ni soustraction de fond, ni calibration en taille ou concentration, ni correction de migration. L'IA ne fournit pas de mesure calibrée à partir de l'image.

## Tm indicative de Wallace

`Tm (°C) = 2 × (A+T) + 4 × (G+C)`.

La valeur n'est affichée que pour les séquences non ambiguës de 14 à 20 nucléotides. Cette règle empirique ne tient pas compte des sels, de la concentration d'ADN ou des additifs. La plage et la formule correspondent à la [documentation Biopython, Tm_Wallace](https://biopython.org/docs/latest/api/Bio.SeqUtils.MeltingTemp.html#Bio.SeqUtils.MeltingTemp.Tm_Wallace), consultée le 13 octobre 2026. GeneForge refuse les caractères invalides avant le calcul.

## Tm locale avec Primer3

L'adaptateur `src/core/primer3_adapter.py` appelle `primer3.calc_tm` dans **Primer3-py 2.3.1**. Le modèle de plus proches voisins et la correction saline sont explicitement `santalucia`, avec `max_nn_length=60`, DMSO et formamide à zéro. La séquence doit contenir de 2 à 60 bases canoniques. Cette borne empêche le basculement implicite du moteur vers sa formule pour les longues séquences. Le résultat conserve la version du moteur, les deux noms de modèle et tous les paramètres saisis. Voir [l'API officielle Primer3-py](https://libnano.github.io/primer3-py/api/bindings.html#primer3.bindings.calc_tm) et le [manuel Primer3](https://primer3.org/manual.html).

| Paramètre JSON | Unité                     | Limites de saisie GeneForge          |
| -------------- | ------------------------- | ------------------------------------ |
| `mv_conc`      | mM de cations monovalents | 0 à 1 000                            |
| `dv_conc`      | mM de cations divalents   | 0 à 100                              |
| `dntp_conc`    | mM de dNTP                | 0 à 100                              |
| `dna_conc`     | nM d'ADN                  | strictement positif, au plus 100 000 |

Ces bornes sont des limites applicatives, pas une validation expérimentale de toute cette plage. Tous les nombres doivent être finis. Le cas sans concentration ionique effective positive (`mv_conc=0` et `dv_conc≤dntp_conc`) est refusé. Le calcul dépend des conditions renseignées ; il ne détermine pas un protocole expérimental ni une température d'hybridation recommandée.

L'adaptateur reçoit un unique objet JSON sur l'entrée standard et renvoie un unique objet JSON sur la sortie standard. En cas d'erreur, il renvoie `{ "error": "..." }` et termine avec le code 1. Aucun appel de conception d'amorces n'est exposé. Les alignements Biopython, les structures secondaires et les autres analyses du cahier des charges restent hors du périmètre de ce MVP. La future intégration d'alignements suivra [l'API PairwiseAligner officielle](https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html).

## FASTA et CSV

- FASTA : plusieurs enregistrements, en-têtes complets, fins de ligne Windows/Unix, BOM UTF-8 accepté. Les en-têtes vides, séquences vides, caractères invalides et données précédant le premier en-tête provoquent une erreur. L'export écrit des lignes de 80 bases. Les descriptions d'en-tête sont conservées dans le nom.
- CSV : séparateur virgule (ou tabulation détectée dans les en-têtes TSV) ; colonnes `name` et `sequence` obligatoires, `notes` et `tags` facultatives. L'ordre peut varier. Les autres colonnes et les doublons d'en-tête sont refusés. Les champs entre guillemets, guillemets doublés et notes sur plusieurs lignes sont pris en charge. Les tags sont séparés par `;` dans leur cellule.
- Les imports sont limités à 20 millions de caractères. Les diagnostics CSV utilisent les numéros de ligne physiques ; les erreurs de séquence FASTA indiquent la ligne concernée.
- À l'export CSV, les cellules ressemblant à des formules de tableur reçoivent une apostrophe initiale avant l'échappement CSV. Cette protection est conservée lors d'une réimportation : le champ protégé peut donc différer du texte d'origine par une apostrophe. La sauvegarde native des projets reste le format de conservation fidèle des métadonnées.

## Vérification

`pnpm test` couvre la composition ambiguë, les couples IUPAC, les orientations, les coordonnées, les bornes Wallace, la corruption des fichiers et les formules CSV. Les tests de recherche comparent aussi KMP à une référence naïve sur des cas aléatoires déterministes et vérifient une cible répétitive de 1 000 000 de bases. Les tests d'annotations et de migration contrôlent les sens, doublons, copies de source et sauvegardes. `python tests/primer3_test.py` vérifie le moteur réel, la référence numérique publiée par Primer3-py, la transmission des paramètres, les bornes et le protocole JSON. Ce deuxième groupe nécessite Primer3-py 2.3.1 dans l'environnement Python ou dans `.python-deps` à la racine du projet. Les jeux de données de base sont artificiels ; la valeur de référence Primer3 provient de son [exemple officiel](https://libnano.github.io/primer3-py/quickstart.html).
