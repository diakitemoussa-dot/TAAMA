/* ==========================================================
   TAPAMA CONNAÎT CHAQUE PHRASE DES LIVRES DE BAREY SO
   ----------------------------------------------------------
   Clé = « numéro du livre : numéro de la phrase » (comme dans app/bibliotheque-textes.js).
   Quand le joueur montre ses phrases dans le labo (dispositif 2), Tapama les décortique une par une avec ces explications.
   ========================================================== */
export const EXPLICATIONS = {
  '1:0': { mood: 'attentive', text: 'Les torons, ce sont ces poutres de bois qui dépassent des murs. Elles restent en place pour toujours : les maçons grimpent dessus pour réparer et enduire la mosquée, sans échafaudage.' },
  '1:1': { mood: 'attentive', text: 'Les torons dépassent du mur, donc ils font de petites ombres sur la terre. L’ombre protège l’enduit du soleil brûlant, et il craque moins vite.' },
  '2:0': { mood: 'curieuse', text: 'Un canari, c’est une jarre en céramique, faite à la main par des potiers de la région. Il y en a 104 sur la mosquée, posés dans le toit.' },
  '2:1': { mood: 'curieuse', text: 'La céramique laisse passer l’air, mais retient la chaleur dehors. À l’intérieur il fait plus frais, et la lumière arrive douce, sans éblouir ceux qui prient.' },
  '3:0': { mood: 'souriante', text: 'L’œuf d’autruche est un très vieux symbole en Afrique. Il rappelle que la vie commence, qu’elle peut donner d’autres vies, et qu’elle se renouvelle toujours.' },
  '3:1': { mood: 'souriante', text: 'Les œufs sont posés tout en haut des tours, là où on les voit de loin. C’est une manière de dire que la mosquée veille sur la vie de la ville.' },
  '4:0': { mood: 'attentive', text: 'Les piliers portent le toit de la salle de prière. Ils sont épais et serrés, parce que la terre est lourde et ne supporte pas de grandes portées.' },
  '4:1': { mood: 'attentive', text: 'Les piliers rappellent aussi la communauté : tous ensemble, chacun porte un peu du poids. La mosquée tient parce que les gens s’organisent autour d’elle.' },
  '5:0': { mood: 'souriante', text: 'Chaque année, avant la saison des pluies, tout Djenné se retrouve pour recouvrir la mosquée d’une nouvelle couche de terre. Sans ça, la pluie la dissoudrait peu à peu.' },
  '5:1': { mood: 'souriante', text: 'Pour les jeunes, apporter le premier mortier est un honneur. La fête transmet le métier d’une génération à la suivante, et c’est ça qui garde la mosquée vivante.' },
  '6:0': { mood: 'attentive', text: 'Au Sahel, on trouve de la terre partout, alors que le bois et la pierre sont rares. C’est pour ça qu’on sait bâtir avec elle depuis des siècles.' },
  '6:1': { mood: 'attentive', text: 'Les savoir-faire d’ici, comme les murs épais et la terre crue, gardent la fraîcheur. Ils inspirent aujourd’hui des logements adaptés à la chaleur, sans dépendre de machines.' },
  '7:0': { mood: 'souriante', text: 'Un joyau, c’est un trésor. Cette mosquée est bâtie en terre, et pourtant elle est magnifique et solide, au cœur de la ville de Djenné.' },
  '7:1': { mood: 'souriante', text: 'Elle a été reconstruite en 1907, sur les traces d’anciennes mosquées. Elle sert de lieu de prière, mais aussi de rencontre et de fêtes pour toute la ville.' },
  '7:2': { mood: 'souriante', text: 'L’UNESCO protège les lieux qui comptent pour toute l’humanité. Depuis 1988, la mosquée et la vieille ville de Djenné en font partie, et elle compte parmi les plus grands édifices en terre crue.' },
  '8:0': { mood: 'attentive', text: 'Sur la terrasse, devant le mur de prière, reposent deux personnes importantes de la ville. Leurs tombes sont très simples, sans décor.' },
  '8:1': { mood: 'attentive', text: 'La baraka, c’est une bénédiction, une force bienfaisante. Les gens viennent la demander près de ces tombes, avec respect et en silence.' },
  '8:2': { mood: 'attentive', text: 'Ces tombes sont en terre, comme la mosquée. On les entretient comme les murs : avec de la terre, de l’eau et beaucoup de patience.' },
  '9:0': { mood: 'curieuse', text: 'Le mihrab est une niche dans le mur. Elle indique la direction de La Mecque, vers laquelle tous les fidèles se tournent pour prier.' },
  '9:1': { mood: 'curieuse', text: 'L’imam se place près du mihrab pour diriger la prière, surtout celle du vendredi, quand les fidèles sont les plus nombreux.' },
  '9:2': { mood: 'curieuse', text: 'Les jours de fête, la salle ne suffit plus. Les gens s’installent dans la cour, et toute la ville prie ensemble.' },
  '10:0': { mood: 'curieuse', text: 'Des trous dans le toit laissent sortir l’air chaud. L’air frais entre alors par d’autres ouvertures : la mosquée respire.' },
  '10:1': { mood: 'curieuse', text: 'Quand il pleut, on pose un canari sur chaque ouverture pour la boucher. Quand le soleil revient, on les retire pour aérer de nouveau.' },
  '10:2': { mood: 'curieuse', text: 'Pas de climatiseur ici : seuls les murs épais, l’ombre et la circulation de l’air gardent la fraîcheur. C’est une idée très ancienne, et très moderne.' },
  '11:0': { mood: 'souriante', text: 'Le Bani est le fleuve qui entoure Djenné. Pendant les pluies, il monte, et la ville ressemble à une île.' },
  '11:1': { mood: 'souriante', text: 'Chaque lundi, le grand marché se tient devant la mosquée. Des marchands viennent de tout le Sahel pour acheter et vendre.' },
  '11:2': { mood: 'souriante', text: 'Le fleuve transportait les marchandises en pirogue. C’est grâce à ce commerce que Djenné est devenue riche et célèbre.' },
  '12:0': { mood: 'attentive', text: 'Cette phrase résume tout : la mosquée a traversé les siècles parce que des gens ont gardé le savoir de construire en terre, et se le sont transmis ensemble.' },
  '12:1': { mood: 'attentive', text: 'Régénératif veut dire qui répare au lieu d’abîmer. Highdigenous, c’est puiser dans les savoirs d’ici pour inventer demain. C’est l’idée de tout ce jeu.' },
  '12:2': { mood: 'attentive', text: 'C’est une invitation, pour toi. Ce que tu as appris ici peut servir à bâtir le futur. À toi de choisir ce que tu en feras.' },
};
