// Die Geschichte von BLUTMOND – alle Texte an einem Ort.
//
// Ingonesien. Zu Füßen von Schloss Nachtfels liegt die Stadt Ingopolis.
// Du bist Fürst Ingomar von Nachtfels, der Vampirfürst dieses Landes.
// Vor dreihundert Jahren hat dich der Orden vom Silbernen Morgen in deiner
// Gruft versiegelt und deine Gemahlin Yvonne in einen Kristall aus geweihtem
// Licht gesperrt. Ihr Blut treibt seither das Sonnenwerk an: eine Maschine,
// die ewigen Tag über Ingonesien erzwingt.
//
// Heute Nacht steigt der Blutmond auf – und für wenige Stunden stottert das
// Sonnenwerk. Dein Sohn Henry weckt dich. Oma Renate und Opa Egon, Yvonnes
// Eltern, haben ihn all die Jahre versteckt.
//
// Platzhalter in Texten: {jump} {attack} {lance} {dash} {drain} {wolfClaw}
// werden durch das passende Tastensymbol ersetzt (Gamepad oder Tastatur).

export const SPEAKERS = {
  ingomar:    { name: 'Ingomar',                   color: '#ff5468', side: 'left' },
  henry:      { name: 'Henry',                     color: '#ff9aa8', side: 'right' },
  yvonne:     { name: 'Yvonne',                    color: '#e06a8a', side: 'right', voice: true },
  renate:     { name: 'Oma Renate',                color: '#c8b0e0', side: 'right' },
  egon:       { name: 'Opa Egon',                  color: '#e0c890', side: 'right' },
  narrator:   { name: '',                          color: '#d8d0e0', side: 'none' },
  prisoner:   { name: 'Gefangener',                color: '#d8c0a8', side: 'right' },
  ines:       { name: 'Ines',                      color: '#c8b8e8', side: 'right' },
  matthias:   { name: 'Matthias',                  color: '#e8d090', side: 'right' },
  ambrosius:  { name: 'Bruder Ambrosius',          color: '#f0c860', side: 'right' },
  mirella:    { name: 'Schwester Mirella',         color: '#90c8ff', side: 'right' },
  isolde:     { name: 'Isolde von Hagen',          color: '#ff9a5a', side: 'right' },
  malachias:  { name: 'Skriptor Malachias',        color: '#b0a0ff', side: 'right' },
  cogliostro: { name: 'Magister Cogliostro',       color: '#ffb040', side: 'right' },
  serafine:   { name: 'Großinquisitorin Serafine', color: '#fff0b0', side: 'right' },
};

/** Vorspann beim neuen Spiel – erscheint Zeile für Zeile auf Schwarz. */
export const PROLOGUE = [
  'Ingonesien.',
  'Dreihundert Jahre lang herrschte Fürst Ingomar von Nachtfels über die Nacht dieses Landes. Die Bürger von Ingopolis zahlten ihren Zehnt in Blut – und lebten gut, solange sie zahlten.',
  'Dann kam der Orden vom Silbernen Morgen.',
  'In der hellsten Stunde des Mittsommertages stürmten sie Schloss Nachtfels. Sie trieben einen Silberpflock durch das Herz des Fürsten und versiegelten ihn in seiner Gruft.',
  'Seine Gemahlin, Fürstin Yvonne, sperrten sie in einen Kristall aus geweihtem Licht. Um sie herum bauten sie eine Maschine: das Sonnenwerk. Mit ihrem Blut erzwingt es seither den ewigen Tag.',
  'Auf den Trümmern des Thronsaals errichteten sie ihre Kathedrale.',
  'Das ist dreihundert Jahre her.',
  'Heute Nacht steigt der Blutmond auf.',
];

/**
 * Dialogszenen. Jede Zeile: { who, text }. Zeilen mit `choice` bieten eine
 * Entscheidung an (Ergebnis wählt das Spiel aus).
 */
export const SCENES = {
  // --- Die Gruft --------------------------------------------------------------
  'intro.awaken': [
    { who: 'henry', text: 'Vater! Vater, wach auf!' },
    { who: 'ingomar', text: '… Henry? Du bist groß geworden.' },
    { who: 'henry', text: 'Dreihundert Jahre, Vater. Oma Renate und Opa Egon haben mich versteckt. In den Katakomben. Bei den Ratten.' },
    { who: 'henry', text: 'Heute Nacht steht der Blutmond am Himmel. Das Sonnenwerk stottert – aber nur bis zum Morgengrauen!' },
    { who: 'ingomar', text: 'Und deine Mutter?' },
    { who: 'henry', text: 'Oben. In der Kathedrale, im Kristall. Manchmal höre ich sie singen. Im Traum.' },
    { who: 'ingomar', text: 'Dann holen wir sie. Und wer sich uns in den Weg stellt, wird getrunken.' },
    { who: 'henry', text: 'Ich komme mit! Als Fledermaus merkt mich keiner.' },
    { who: 'ingomar', text: 'Bleib dicht bei mir, mein Sohn. Und sieh gut hin. So holt sich ein Fürst sein Schloss zurück.' },
  ],
  'intro.holy': [
    { who: 'henry', text: 'Vorsicht, Vater! Siehst du die Lichtschächte? Das ist geweihtes Licht. Das brennt!' },
    { who: 'ingomar', text: 'Der Orden hat Fenster in meine Gruft geschlagen. Wie unhöflich.' },
    { who: 'henry', text: 'Sie flackern. Warte, bis sie schwach werden – dann schnell durch!' },
  ],
  'krypta.boss.intro': [
    { who: 'ambrosius', text: 'Dreihundert Jahre habe ich an deinem Sarg gewacht, Bestie. Dreihundert Jahre ohne Schlaf.' },
    { who: 'ingomar', text: 'Das sieht man dir an, Mönch.' },
    { who: 'ambrosius', text: 'Das Licht des Ordens hat mich am Leben gehalten. Für genau diese Nacht. Du kommst hier nicht hinaus!' },
  ],
  'krypta.boss.defeat': [
    { who: 'ambrosius', text: 'Der Morgen … wird … kommen …' },
    { who: 'ingomar', text: 'Nicht heute Nacht. Schlaf endlich, alter Mann.' },
  ],

  // --- Die Reliquienkammern ----------------------------------------------------
  'katakomben.arrive': [
    { who: 'yvonne', text: 'Ingomar … bist du das? Ich spüre dein Herz. Es schlägt wieder.' },
    { who: 'henry', text: 'Mama!' },
    { who: 'ingomar', text: 'Halte durch, meine Liebste. Ich komme – und ich bringe unseren Sohn mit.' },
  ],
  'katakomben.boss.intro': [
    { who: 'mirella', text: 'Jeder Tropfen in diesen Hallen ist dreifach geweiht, Fürst. Ich habe sie selbst gesegnet. Einen nach dem anderen.' },
    { who: 'ingomar', text: 'Dreihundert Jahre lang Wasser segnen. Ihr beim Orden wisst wirklich, wie man lebt.' },
    { who: 'mirella', text: 'Spotte nur. Du wirst darin ertrinken.' },
  ],
  'katakomben.boss.defeat': [
    { who: 'mirella', text: 'Das Wasser … es hat dich nicht … aufgehalten …' },
    { who: 'henry', text: 'Vater, sieh nur – du löst dich in Nebel auf! Wie früher, in Omas Geschichten!' },
  ],

  // --- Die Zwinger -------------------------------------------------------------
  'hof.arrive': [
    { who: 'henry', text: 'Die Zwinger. Hier halten sie die Hunde, Vater. Die haben mich damals fast erwischt.' },
    { who: 'ingomar', text: 'Dann werden die Hunde heute Nacht satt. Von ihrer eigenen Herrin.' },
    { who: 'yvonne', text: 'Sei vorsichtig, Liebster. Unter dem Blutmond sind sie wilder als sonst. Genau wie du.' },
  ],
  'hof.boss.intro': [
    { who: 'isolde', text: 'Meine Hunde haben deine Brut durch halb Ingonesien gejagt, Fürst. Bis in die Wälder hinter Ingopolis.' },
    { who: 'henry', text: 'Das war SIE! Die mit den roten Haaren!' },
    { who: 'isolde', text: 'Heute jagen sie den Vater. Fass!' },
  ],
  'hof.boss.defeat': [
    { who: 'isolde', text: 'Bei allen Heiligen … du fliegst?' },
    { who: 'ingomar', text: 'Die Fledermäuse gehorchen mir wieder. Deine Hunde übrigens auch.' },
  ],

  // --- Die Bibliothek ----------------------------------------------------------
  'bibliothek.arrive': [
    { who: 'ingomar', text: 'Meine Bibliothek. Sie haben meine Bücher gelesen.' },
    { who: 'henry', text: 'Und neue geschrieben. Über dich, Vater.' },
    { who: 'yvonne', text: 'Sie wissen alles über dich, Liebster. Alles außer dem, was zählt.' },
  ],
  // Die Chronisten von Ingopolis haben sich zwischen den Regalen versteckt.
  'bibliothek.archivists': [
    { who: 'matthias', text: 'Nicht beißen! Wir sind keine Jäger! Wir sind … Chronisten!' },
    { who: 'ines', text: 'Matthias, er beißt nicht. Jedenfalls nicht uns. – Fürst Ingomar. Wir haben auf Euch gewartet.' },
    { who: 'ingomar', text: 'Zwei Menschen aus Ingopolis, versteckt in meiner Bibliothek. Erklärt euch.' },
    { who: 'ines', text: 'Ich bin Ines, das ist Matthias. Wir schreiben die Chronik von Ingopolis. Die echte – nicht die, die der Orden predigt.' },
    { who: 'matthias', text: 'Und wir haben Kapitel neun geschrieben. Das, was dem Skriptor noch fehlt. Mit Bleistift – falls wir uns vertun.' },
    { who: 'ingomar', text: 'Und was steht darin?' },
    { who: 'ines', text: 'Dass Ihr liebt. Und wer liebt, kommt immer zurück. Malachias hat das nie verstanden.' },
    { who: 'matthias', text: 'Hier. Die Karte von Ingonesien. Jeder Gang, jede Kammer, jedes Versteck in Eurem Schloss. Hat uns nur vierzig Jahre gekostet.' },
    { who: 'ingomar', text: 'Ihr seid mutiger als der halbe Orden.' },
    { who: 'ines', text: 'Wir sind nur neugierig. Und jetzt geht – Yvonne wartet. Wir schreiben mit.' },
  ],
  'bibliothek.archivists.again': [
    { who: 'matthias', text: 'Kapitel zehn wird spannend. Ich spitze schon mal den Bleistift.' },
    { who: 'ines', text: 'Viel Glück, Fürst. Die Chronik von Ingopolis braucht ein gutes Ende.' },
  ],

  'bibliothek.boss.intro': [
    { who: 'malachias', text: 'Ah. Der Gegenstand meiner Forschung. Persönlich.' },
    { who: 'malachias', text: 'Ich kenne jede deiner Schwächen, Ingomar. Ich habe sie aufgeschrieben. Kapitel sieben: Licht. Kapitel acht: Silber.' },
    { who: 'ingomar', text: 'Und Kapitel neun?' },
    { who: 'malachias', text: 'Kapitel neun ist … noch nicht fertig.' },
    { who: 'ingomar', text: 'Dann schreibe ich es für dich.' },
  ],
  'bibliothek.boss.defeat': [
    { who: 'malachias', text: 'Die Wolfsklaue … das stand in keinem … Buch …' },
    { who: 'ingomar', text: 'Manche Dinge muss man erleben, Skriptor.' },
  ],

  // --- Das Sonnenwerk ----------------------------------------------------------
  'uhrturm.arrive': [
    { who: 'yvonne', text: 'Ich höre die Zahnräder, Ingomar. Jedes einzelne dreht sich mit meinem Blut.' },
    { who: 'ingomar', text: 'Dann halte ich jedes einzelne an.' },
    { who: 'henry', text: 'Opa Egon sagt, wer die Uhr anhält, hält die Sonne an.' },
  ],
  'uhrturm.boss.intro': [
    { who: 'cogliostro', text: 'Vorsicht! Nicht die Zahnräder anfassen! Das ist ein Meisterwerk!' },
    { who: 'cogliostro', text: 'Ihr Blut treibt die Kessel, die Kessel treiben die Räder, die Räder treiben die Sonne. Wirkungsgrad: bemerkenswert!' },
    { who: 'ingomar', text: 'Du hast meine Frau in einen Ofen gesteckt, Uhrmacher.' },
    { who: 'cogliostro', text: 'In einen sehr GUTEN Ofen!' },
  ],
  'uhrturm.boss.defeat': [
    { who: 'cogliostro', text: 'Mein Werk … es steht still …' },
    { who: 'yvonne', text: 'Ingomar … die Hitze ist fort. Ich … ich kann mich wieder bewegen.' },
    { who: 'henry', text: 'Vater! Dein Umhang glänzt wie der Mond!' },
  ],

  // --- Die Kathedrale ----------------------------------------------------------
  'kathedrale.arrive': [
    { who: 'henry', text: 'Das war mal dein Thronsaal?' },
    { who: 'ingomar', text: 'Das IST mein Thronsaal. Sie haben nur umdekoriert.' },
    { who: 'yvonne', text: 'Ich bin ganz nah, Liebster. Aber sie ist auch hier. Die Enkelin des Mannes, der dir das Herz durchbohrt hat.' },
  ],
  'kathedrale.boss.intro': [
    { who: 'serafine', text: 'Ingomar von Nachtfels. Mein Ahnherr Aldric hat dir das Herz durchbohrt.' },
    { who: 'serafine', text: 'Ich werde es verbrennen. Und dann das deines Sohnes.' },
    { who: 'henry', text: 'Vater …' },
    { who: 'ingomar', text: 'Geh hinter mich, Henry. Das hier ist eine Sache zwischen Fürst und Jägerin.' },
  ],
  'kathedrale.boss.phase2': [
    { who: 'serafine', text: 'Glaubst du, das war alles? Das Licht des Ordens brennt in mir!' },
  ],
  'kathedrale.boss.defeat': [
    { who: 'serafine', text: 'Tu es. Trink. Beweise, dass wir recht hatten. Dass du nichts bist als ein Ungeheuer.' },
    { who: 'ingomar', text: '…', choice: 'serafine' },
  ],
  'kathedrale.serafine.drink': [
    { who: 'ingomar', text: 'Ihr hattet recht. Das hattet ihr immer.' },
    { who: 'narrator', text: 'Das Blut der Sonnenschwurs schmeckt nach Mittag. Zum letzten Mal.' },
  ],
  'kathedrale.serafine.spare': [
    { who: 'ingomar', text: 'Nein. Du wirst leben. Und du wirst deinem Orden erzählen, was du heute Nacht gesehen hast.' },
    { who: 'serafine', text: 'Warum?' },
    { who: 'ingomar', text: 'Weil ein Fürst jemanden braucht, der ihn fürchtet. Lauf, Jägerin. Bevor ich es mir anders überlege.' },
  ],
  'ending.throne': [
    { who: 'narrator', text: 'Hinter dem Altar des Ordens, dort, wo einst der Thron stand, pulsiert ein Kristall aus Licht.' },
    { who: 'yvonne', text: 'Ingomar.' },
    { who: 'ingomar', text: 'Yvonne. Dreihundert Jahre. Verzeih, dass ich zu spät bin.' },
    { who: 'yvonne', text: 'Du warst schon immer unpünktlich. Und jetzt hol mich hier raus.' },
  ],
  'ending.reunion': [
    { who: 'henry', text: 'MAMA!' },
    { who: 'yvonne', text: 'Henry … mein Kleiner. Sieh dich an. Du hast die Augen deines Vaters.' },
    { who: 'renate', text: 'Na endlich! Dreihundert Jahre habe ich gewartet, und dann kommt ihr alle zur selben Zeit.' },
    { who: 'egon', text: 'Die Kutsche steht draußen. Oder bleiben wir? Ich finde, der Thron sieht noch ganz ordentlich aus.' },
    { who: 'ingomar', text: 'Wir bleiben. Das Haus Nachtfels ist zurück.' },
  ],

  // --- Checkpoints: Oma Renate hütet die Särge --------------------------------
  'checkpoint.first': [
    { who: 'renate', text: 'Da bist du ja, mein Junge! Dreihundert Jahre und immer noch so blass.' },
    { who: 'renate', text: 'Ich habe dir in jedem Stockwerk einen Sarg frisch gepolstert. Leg dich rein, wann immer du müde bist – dann bist du wieder bei Kräften.' },
    { who: 'egon', text: 'Und wenn du woanders hinwillst: Ich fahre die Sargkutsche. Die Fledermäuse ziehen, ich halte die Zügel.' },
    { who: 'ingomar', text: 'Renate. Egon. Danke, dass ihr auf ihn aufgepasst habt.' },
    { who: 'renate', text: 'Er ist unser Enkel. Und jetzt trink was, du bist ja nur noch Haut und Knochen.' },
  ],

  // --- Gefangene aus Ingopolis -------------------------------------------------
  'prisoner.1': [
    { who: 'prisoner', text: 'Herr … Fürst Ingomar? Ihr seid es wirklich?' },
    { who: 'prisoner', text: 'Der Orden hat mich eingesperrt, weil meine Großmutter Euch einst Blut gezahlt hat. Sie nennen uns „Nachtfreunde".' },
    { who: 'ingomar', text: '…', choice: 'prisoner' },
  ],
  'prisoner.2': [
    { who: 'prisoner', text: 'Bitte … ich bin nur ein Bäcker aus Ingopolis. Ich habe früher Brot ans Schloss geliefert.' },
    { who: 'prisoner', text: 'Deshalb haben sie mich geholt. Wegen Brot.' },
    { who: 'ingomar', text: '…', choice: 'prisoner' },
  ],
  'prisoner.3': [
    { who: 'prisoner', text: 'Ich habe keine Angst vor Euch, Fürst. Nicht mehr. Vor dem Licht habe ich Angst.' },
    { who: 'ingomar', text: '…', choice: 'prisoner' },
  ],
  'prisoner.drink': [
    { who: 'narrator', text: 'Sein Blut ist warm. Dein Hunger ist größer als dein Mitleid.' },
  ],
  'prisoner.spare': [
    { who: 'prisoner', text: 'Gnade? Vom Fürsten? … Ganz Ingopolis wird davon erzählen!' },
    { who: 'henry', text: 'Das war schön, Vater.' },
  ],

  // --- Tod ----------------------------------------------------------------------
  'death': [
    { who: 'henry', text: 'Vater! Steh auf! Oma Renate hat den Sarg schon gewärmt!' },
  ],
};

/** Kurze Hinweise von Henry (erscheinen als Sprechblase, pausieren das Spiel nicht). */
export const HINTS = {
  'hint.move': 'Lauf los, Vater! Mit dem linken Stick!',
  'hint.attack': 'Da, ein Skelett! Hau mit {attack} drauf – dreimal hintereinander!',
  'hint.jump': 'Mit {jump} springst du. Länger drücken = höher!',
  'hint.drain': 'Wenn sie in die Knie gehen: {drain} und trinken! Das heilt und gibt Blut.',
  'hint.dash': 'Mit {dash} weichst du blitzschnell aus!',
  'hint.mistGate': 'Das Gitter! Als Nebel ({dash}) kommst du durch!',
  'hint.wolfGate': 'Die Mauer ist morsch. Reiß sie mit der Wolfsklaue ({wolfClaw}) ein!',
  'hint.batGap': 'Zu weit zum Springen … Spring und drück in der Luft nochmal {jump}! Halten = gleiten!',
  'hint.lance': 'Die Blutlanze ({lance}) geht sogar durch Schilde!',
  'hint.checkpoint': 'Ein Sarg! Da wartet Oma Renate. Drück {drain} zum Ausruhen.',
  'hint.knight': 'Der Ritter blockt von vorn! Spring hinter ihn – oder nimm die Lanze!',
  'hint.lowBlood': 'Dein Blut ist fast leer. Trink aus einem Gegner, der in die Knie geht!',
  'hint.secret': 'Hier stimmt was nicht … Hinter dieser Wand ist etwas!',
  'hint.archivists': 'Da versteckt sich jemand hinter den Regalen … Menschen! Sprich sie an, Vater. Mit {drain}.',
};

/** Tagebücher und Briefe der Jäger – sie zeigen dich, wie der Orden dich sieht. */
export const LORE = {
  'krypta.0': {
    title: 'Wachbuch der Gruft',
    text: 'Eintrag 10.411: Der Sarg hat heute Nacht geatmet. Bruder Ambrosius sagt, ich bilde mir das ein. Ich habe trotzdem drei Kerzen mehr angezündet. Und dann noch drei.',
  },
  'krypta.1': {
    title: 'Befehl des Ordens',
    text: 'Jede Seele aus Ingopolis, die dem Fürsten je Blut gezahlt hat, gilt als Nachtfreund und ist in Gewahrsam zu nehmen. Das gilt auch für ihre Kinder. Und für deren Kinder.',
  },
  'katakomben.0': {
    title: 'Notiz von Schwester Mirella',
    text: 'Das Wasser der Reliquienkammern ist dreifach geweiht. Wer es trinkt, lebt länger. Wer darin steht und ein Vampir ist, lebt kürzer. Die Rechnung ist einfach.',
  },
  'katakomben.1': {
    title: 'Suchbefehl',
    text: 'Ein Kind mit roten Augen wurde in den Katakomben gesehen, begleitet von einem alten Paar mit einer Laterne. Ergreifen, nicht verletzen. Magister Cogliostro braucht das Blut der Linie Nachtfels.',
  },
  'hof.0': {
    title: 'Zwingerbuch der Isolde von Hagen',
    text: 'Die Hunde sind unruhig. Sie riechen etwas, das seit dreihundert Jahren niemand mehr gerochen hat. Ich verdopple die Wachen. Und die Rationen.',
  },
  'hof.1': {
    title: 'Brief aus Ingopolis',
    text: 'Liebe Mutter, sie haben den Bäcker geholt, weil er früher Brot ans Schloss geliefert hat. Hier ist es immer hell. Man kann nachts nicht mehr schlafen. Manchmal wünsche ich mir die Dunkelheit zurück. Sag das niemandem.',
  },
  'bibliothek.0': {
    title: 'Traktat über die Vernichtung des Fürsten, Kapitel 3',
    text: 'Er liebt. Das ist seine größte Schwäche. Man nehme ihm, was er liebt, und er wird kommen, um es zu holen. Dann schlage man zu. – Skriptor Malachias',
  },
  'bibliothek.1': {
    title: 'Traktat, Kapitel 9 (unvollendet)',
    text: 'Sollte der Erbe überlebt haben, ist er als gefährlicher einzustufen als der Vater. Er ist jung. Er ist hungrig. Und er hat Großeltern, die',
  },
  'uhrturm.0': {
    title: 'Bauplan des Sonnenwerks, Blatt VII',
    text: 'Der Kristall hält die Fürstin zwischen Schlaf und Tod. Ihr Blut ist die Glut, die den Kessel heizt. Wirkungsgrad: bemerkenswert. Nebenwirkung: Sie singt. Ich trage Wachs in den Ohren. – C.',
  },
  'uhrturm.1': {
    title: 'Zwei Zettel, zusammengeheftet',
    text: '„Der Blutmond steht bevor. Wird das Werk halten? – S." · „Selbstverständlich. Mein Werk hält immer. – C." · Darunter, in anderer Tinte: „Es hat einmal gestottert."',
  },
  'kathedrale.0': {
    title: 'Predigt der Großinquisitorin',
    text: 'Es gibt keine Nacht in Ingonesien. Es hat sie nie gegeben. Wer etwas anderes behauptet, der trete ins Licht und beweise es.',
  },
  'kathedrale.1': {
    title: 'Brief von Aldric Sonnenschwur',
    text: 'An meine Kinder: Ich habe ihm das Herz durchbohrt. Aber ich habe seinen Blick gesehen, als wir sie in den Kristall legten. Er wird kommen. Nicht aus Hunger – aus Liebe. Betet, dass ihr dann nicht zwischen ihm und ihr steht.',
  },
};

/** Sprüche am Sarg – Oma Renate und Opa Egon wechseln sich ab. */
export const CHECKPOINT_LINES = [
  { who: 'renate', text: 'Leg dich ein bisschen hin, mein Junge. Ich hab frisch gepolstert.' },
  { who: 'egon', text: 'Die Kutsche steht bereit, Schwiegersohn. Sag nur, wohin.' },
  { who: 'renate', text: 'Dreihundert Jahre und immer noch zu dünn. Trink mehr, Ingomar!' },
  { who: 'egon', text: 'Früher bin ich die Strecke zweimal in einer Nacht gefahren. Mit Pferden!' },
  { who: 'renate', text: 'Pass mir auf den Kleinen auf, hörst du?' },
  { who: 'egon', text: 'Wenn du den Orden triffst: Grüß ihn nicht von mir.' },
  { who: 'renate', text: 'Yvonne war schon als Mädchen stur. Sie wartet auf dich, da bin ich sicher.' },
  { who: 'egon', text: 'Mit dem Alter wird man nicht klüger. Nur blasser.' },
];

/** Die drei Enden. Welches du bekommst, hängt von deinen Taten ab. */
export const ENDINGS = {
  eternal: {
    title: 'Ewige Nacht',
    lines: [
      'Das Sonnenwerk erlischt. Über Ingonesien legt sich eine Dunkelheit, die nicht mehr weicht.',
      'In Ingopolis verriegeln sie die Türen. Es hilft nichts. Es hat nie geholfen.',
      'Fürst Ingomar und Fürstin Yvonne herrschen wieder vom Thron auf Schloss Nachtfels. Prinz Henry lernt jagen. Oma Renate strickt schwarze Umhänge. Opa Egon fährt die Kutsche.',
      'Die Nacht gehört wieder dem Haus Nachtfels. Für immer.',
    ],
  },
  merciful: {
    title: 'Der gnädige Fürst',
    lines: [
      'Das Sonnenwerk erlischt, und die Nacht kehrt nach Ingonesien zurück.',
      'Am nächsten Abend steigen die Bürger von Ingopolis mit Fackeln den Berg hinauf. Nicht um zu brennen, sondern um zu knien. Unter ihnen der Bäcker.',
      'Man sagt, in Ingonesien fürchtet man die Nacht nicht mehr. Man fürchtet nur, sie zu enttäuschen.',
      'Ines und Matthias schreiben alles auf. Die Chronik von Ingopolis bekommt ein neues Kapitel – mit Tinte diesmal.',
      'Und jeden Sonntag gibt es auf Schloss Nachtfels frisches Brot. Oma Renate besteht darauf.',
    ],
  },
  hunter: {
    title: 'Die letzte Jägerin',
    lines: [
      'Serafine Sonnenschwur flieht im ersten Grau des Morgens aus Ingonesien. Das Sonnenwerk steht still, und der Tag kommt nur noch, wenn er darf.',
      'Das Haus Nachtfels ist wieder vereint. Aber irgendwo jenseits der Berge schmiedet eine Jägerin einen neuen Silberpflock.',
      '„Sie wird wiederkommen", sagt Yvonne. „Ich weiß", sagt Ingomar. Und zum ersten Mal seit dreihundert Jahren lächelt er.',
      'ENDE … vorerst.',
    ],
  },
};

/** Welches Ende? drankSerafine: true/false; mercy/greed: Zähler der Gefangenen. */
export function pickEnding(state) {
  if (!state.storyFlags.drankSerafine) return 'hunter';
  return state.greed >= state.mercy ? 'eternal' : 'merciful';
}

/** Titel und Belohnungstext der Bosse. */
export const BOSS_TITLES = {
  ambrosius: { name: 'Bruder Ambrosius', title: 'Kerkermeister der Gruft' },
  mirella: { name: 'Schwester Mirella', title: 'Die Weiherin der Wasser' },
  isolde: { name: 'Isolde von Hagen', title: 'Herrin der Hunde' },
  malachias: { name: 'Skriptor Malachias', title: 'Der dich aufgeschrieben hat' },
  cogliostro: { name: 'Magister Cogliostro', title: 'Erbauer des Sonnenwerks' },
  serafine: { name: 'Serafine Sonnenschwur', title: 'Großinquisitorin des Silbernen Morgens' },
};
