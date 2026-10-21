# Notes, Gels et Assistant — GeneForge 0.5.0

## Notes et e-Lab

Notes accueille du texte libre, un projet facultatif, des références de fichiers sur serveur, un lien vers une entrée e-Lab et des gels associés. Cet outil prépare les notes à partager ; votre cahier officiel reste dans e-Lab.

- **Copier pour e-Lab** copie le texte et les descriptions détaillées des gels, avec une version HTML simple lorsque le navigateur l'autorise. Coller dans l'éditeur e-Lab et joindre les figures PNG séparément.
- **Exporter PDF** ouvre un aperçu avec figures et légendes. Cliquer sur **Imprimer / enregistrer en PDF**, puis choisir l'imprimante PDF du navigateur. L'export texte reste disponible.
- Le bouton e-Lab ouvre [l'instance LIPME](https://lipme-elab.toulouse.inrae.fr/). Une URL d'entrée précise peut être conservée dans chaque note ou gel. Aucune synchronisation ou écriture distante n'est effectuée. La technologie et les accès de cette instance n'ont pas été vérifiés derrière sa connexion.
- Les chemins des collections du serveur restent des références textuelles à copier. Les fichiers correspondants ne sont pas importés ni modifiés.
- **Enregistrer la note / Ctrl+S** conserve les modifications. La navigation signale les modifications non enregistrées.

## Studio de gels

1. Importer une image PNG, JPEG ou WebP dans **Gels**. L'original est conservé avec son nom, ses dimensions et son empreinte SHA-256. Le logiciel propose le nombre de pistes et le fond à partir de l’image.
2. Choisir **Sélectionner le gel**, puis tracer un rectangle pour relancer la détection sur cette zone. **Détecter automatiquement les pistes** permet aussi de la relancer sur un gel existant. Vérifier la proposition et la corriger au besoin avec **Nombre de pistes → Diviser en pistes égales**. Les pistes ont la même largeur dans l'image source, même lorsque cette largeur est fractionnaire. Une détection remplaçant des légendes existantes demande confirmation.
3. Cliquer sur un numéro au-dessus du gel ou sur une légende latérale. Renseigner titre, description et amorces de la bibliothèque. Une copie des amorces reste disponible après modification ou suppression de leur fiche. Enregistrer le gel pour ouvrir la fiche d'origine.
4. Choisir **Entourer une bande** et tracer une ellipse. La bande est limitée à sa piste ; son titre et sa couleur sont modifiables. Annuler/rétablir inclut les légendes, contours et réglages.
5. Choisir le fond du gel pour les profils (bandes claires sur noir ou sombres sur blanc), puis le fond noir/blanc de la figure exportée. L'original reste inchangé.
6. **Enregistrer le gel / Ctrl+S**, puis exporter la figure PNG avec numéros et légendes, une piste seule, l'original, les mesures CSV ou le rapport PDF. La figure abrège les descriptions longues ; le rapport conserve leur texte complet.

Le calcul Tm depuis une amorce expose concentrations, moteur, version, modèle et correction saline. **Conserver ce calcul dans la légende** copie le résultat, la séquence utilisée et ses conditions dans la description. Les conditions ne sont pas déduites de l'image.

Les contours de bandes sont manuels. La détection de pistes est une proposition fondée sur les signaux visibles et leur espacement. Elle peut inclure une position interne sans signal lorsque l’espacement le permet ; des pistes vides en bordure, un fond irrégulier ou une image peu contrastée peuvent demander une correction manuelle. Si aucun nombre fiable n’est proposé, une seule zone reste disponible avant division manuelle.

Le profil représente la moyenne des pixels par ligne de piste. Les mesures d'une bande utilisent les centres de pixels dans son ellipse : effectif, signal moyen, somme et proportion au niveau maximal. Ce sont des unités arbitraires non calibrées, sans soustraction de fond, détection automatique des bandes, estimation de taille en pb, correction de migration ou concentration. Recadrage et contours sont des superpositions. Rediviser ou recadrer demande confirmation avant d'effacer les contours concernés.

Limites : 3 Mio par image, 6 000 pixels par côté et 12 millions de pixels ; 1–48 pistes, huit amorces par piste et 1 000 contours par gel. L'espace et ses images partagent la limite de requête/sauvegarde de 16 Mio. Les TIFF doivent être convertis avant import. Le studio est une implémentation GeneForge ; [GelAnalyzer](https://gelanalyzer.com/usage/) n'est pas embarqué.

## Assistant IA optionnel

La clé `OPENAI_API_KEY` est chargée uniquement par le serveur local depuis l'environnement ou `.env.local`, fichier exclu de Git et des sauvegardes. Ne jamais la placer dans un fichier frontend. Le modèle par défaut est `gpt-5.4-mini`, modifiable avec `GENEFORGE_AI_MODEL` côté serveur ; `gpt-6-luna` peut aussi servir de modèle de départ pour des essais simples selon les accès du projet.

Choisir au maximum 12 sources, consulter le contexte, puis envoyer la question. Notes, métadonnées de séquences, gels, projets et amorces sont sélectionnables. Les images des gels sont jointes seulement si leur case est cochée. Les séquences génomiques et les fichiers du serveur sont exclus ; les amorces choisies comprennent leur séquence. Limites : 80 000 caractères de contexte, 8 000 par message, 1 800 tokens de réponse, une demande à la fois et dix demandes par minute.

L'[API Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses) est appelée avec `store: false` ; cela ne garantit pas l'absence de toute rétention par le fournisseur. Le navigateur reçoit la réponse et le modèle, jamais la clé. Les références aux sources ouvrent les fiches GeneForge.

Les réponses peuvent être copiées ou conservées comme notes portant la mention IA. Elles doivent être vérifiées avant réutilisation. L'assistant ne modifie pas automatiquement les documents et ne remplace pas les calculs scientifiques. Les observations visuelles restent qualitatives. La conversation est temporaire et disparaît en quittant cet espace ou en changeant la sélection des sources.

Une erreur `AI_QUOTA` signale un crédit API épuisé ou une limite de dépense : vérifier [la facturation](https://platform.openai.com/settings/organization/billing) et [les limites](https://platform.openai.com/settings/organization/limits). Une erreur de clé exige son renouvellement ; une limite temporaire nécessite d'espacer les demandes. Un abonnement ChatGPT n'active pas à lui seul la facturation API. Les notes et gels restent utilisables indépendamment de l'IA.
