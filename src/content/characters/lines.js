// Companion dialogue content (issue #25 part 2). Data only — no engine, no imports, nothing that runs.
//
// WHY THIS IS NOT IN THE HERO DEFS. Issue #25 asks for the lines to live "with the character in
// src/content/characters/*.js", and this file is in exactly that folder, for the reason the folder's own registry
// already gives: characters/index.js attaches Pip's move list from a sibling module because "pip.js was already over
// the ~700-line file cap and must not grow further". Four more tables would push every hero def past it. The other
// half of the precedent is content/enemies/codex.js — one prose file, merged into the defs at registry load — and a
// banter table is not a hero's data anyway: it belongs to a PAIR of them, and has nowhere to live on either.
//
// HOW A LINE IS PICKED (game/dialogue.js). `world.frame` indexes the row, so the choice is deterministic and both
// peers of a netplay match say the same thing without anything going over the wire. Nothing here is random.
//
// THE 42-CHARACTER RULE. A plate is drawn in the 5px pixel font over a fighter's head and clamped into a 640px view
// (engine/text.js, game/dialogue.js). Past about 42 characters the plate is wider than the space a body has to
// stand in, and two speakers overlap. tools/simtest.js asserts the limit, so a long line fails the build rather
// than shipping unreadable.
//
// THE VOICES (docs/GDD.md section 2): Brunhild blunt, Sael quick, Rook dry, Pip cheerful.
//   Brunhild Coalheart  boilerwright. Diagnosis, then instruction, then nothing. Judges a place by its workmanship.
//   Sael                sky-courier. Reads exits, distances and times the moment she walks in. Owes 400 letters.
//   Rook Halloway       captain. Prices everything, orders nothing, and says the flat fact instead of the feeling.
//   Pip Gearlock        tinkerer in a 7-foot rig. Cheerful about load ratings. Talks about the rig, not herself.

/**
 * Two-hero exchanges, keyed by the pairing in CHARACTERS order (`brunhild+sael`, never `sael+brunhild`) and then by
 * trigger. `a` is spoken by the hero named first in the key and `b` answers it ~45 frames later, so the rows read
 * in the order they are written here whichever slot each player is sitting in.
 *
 * sectionStart and combo20 carry two rows because they fire many times in a run; the other five fire once or twice.
 * @type {Record<string, CharacterLines>}
 */
export const BANTER = {
  'brunhild+sael': {
    sectionStart: [
      { a: 'SEAMS ARE A YEAR OLD. NOT TEN.', b: 'I FLEW OVER THIS A YEAR AGO.' },
      { a: 'THIS LANE\'S MINE. GET ON IT AND STAY.', b: 'BEEN DOWN IT TWICE. IT\'S NINETY YARDS.' },
    ],
    midbossIntro: [
      { a: 'BUILT FOR A YARD. NOT FOR THIS.', b: 'FRONT LANE\'S YOURS. I\'M BEHIND IT.' },
    ],
    bossIntro: [
      { a: 'THERE\'S THE ONE WHO SIGNED FOR IT.', b: 'NOTHING IN THE SATCHEL FOR HIM.' },
    ],
    partnerDown: [
      { a: 'PLATE\'S UP. WORK BEHIND ME.', b: 'THEN I STOP MOVING. TWO SECONDS.' },
    ],
    partnerContinue: [
      { a: 'YOU CAME BACK. STAND CLOSER THIS TIME.', b: 'TWO LEFT. NOT SPENDING ONE STANDING.' },
    ],
    combo20: [
      { a: 'THEY WALK IN AT THE SAME HEIGHT.', b: 'SAME LANE. NOT ONE STEPPED OFF IT.' },
      { a: 'SMALL HITS. A LOT OF THEM.', b: 'EVERY DOOR ON THE ROUTE. TWICE.' },
    ],
    results: [
      { a: 'HOW MANY OF THOSE LETTERS LEFT?', b: 'THREE HUNDRED AND EIGHTY-SIX. TWO OFF.' },
    ],
  },
  'brunhild+rook': {
    sectionStart: [
      { a: 'THAT GANGWAY\'S BOLTED THROUGH RUST.', b: 'THE OTHER GANGWAY. YOU\'RE IN FRONT.' },
      { a: 'NOT OILED IN YEARS. NONE OF IT.', b: 'NOBODY\'S PAID FOR IT. NOBODY WILL.' },
    ],
    midbossIntro: [
      { a: 'YARD PLANT WITH A SEAT WELDED ON.', b: 'THAT\'S A TITLE ON COMPANY PLANT.' },
    ],
    bossIntro: [
      { a: 'THERE\'S THE ONE WHO SIGNED FOR IT.', b: 'THE ACCOUNT\'S STANDING UP. SETTLE IT.' },
    ],
    partnerDown: [
      { a: 'THE LOAD JUST CAME BACK ONTO US.', b: 'I\'LL TAKE THE EMPTY LANE. CLOSE UP.' },
    ],
    partnerContinue: [
      { a: 'UP AGAIN. NOTHING BENT THAT MATTERS.', b: 'EXPENSIVE. SOMEBODY\'S PAYING FOR IT.' },
    ],
    combo20: [
      { a: 'STILL WALKING INTO THE SAME SWING.', b: 'TWENTY. SIX ROUNDS I DIDN\'T SPEND.' },
      { a: 'ONE TOOL. THE HEAD\'S STILL TRUE.', b: 'THREE HERE. SWORD, BOOT, BULLET.' },
    ],
    results: [
      { a: 'THE PLATE HELD. IT\'LL WANT RE-RIVETING.', b: 'IT ALWAYS DOES. PUT IT ON THE TAB.' },
    ],
  },
  'brunhild+pip': {
    sectionStart: [
      { a: 'BAD DRAW IN HERE.', b: 'NINE BAR. AND NOTHING VENTS.' },
      { a: 'BEHIND ME UNTIL THE ROOM OPENS.', b: 'THE RIG WALKS AT YOUR SPEED ANYWAY.' },
    ],
    midbossIntro: [
      { a: 'THAT\'S STRAPPED ON. NOT BUILT IN.', b: 'THEN IT COMES APART AT THE STRAPS.' },
    ],
    bossIntro: [
      { a: 'WHO SIGNED THAT MACHINE OFF?', b: 'ASK WHOEVER\'S WEARING IT.' },
    ],
    partnerDown: [
      { a: 'ONE DOWN. TAKE THAT LANE.', b: 'I\'LL PICK THEM UP. YOU HOLD.' },
    ],
    partnerContinue: [
      { a: 'STAY OFF THAT LANE. I\'LL TAKE IT.', b: 'THEN I\'M MOVING YOU. ARMS IN.' },
    ],
    combo20: [
      { a: 'SAME SWING. THEY KEEP FINDING IT.', b: 'TWO INCHES OFF THAT HANDLE. FASTER.' },
      { a: 'THEY QUEUE UP FOR IT.', b: 'FOUR MORE AND IT\'S A FULL LIFT.' },
    ],
    results: [
      { a: 'ALL OF IT WAS BUILT BY THE HOUR.', b: 'I\'M TAKING THE GOOD BITS ANYWAY.' },
    ],
  },
  'sael+rook': {
    sectionStart: [
      { a: 'TWO WAYS OUT. ONE\'S BEHIND THEM.', b: 'YOURS. I\'LL COME ROUND WITH THE GUN.' },
      { a: 'FOUR MINUTES ACROSS. TWO IF I GO UP.', b: 'TAKE THE FOUR. I\'M NOT FETCHING YOU.' },
    ],
    midbossIntro: [
      { a: 'IT FILLS BOTH LANES. NOT THE AIR.', b: 'THEN THROUGH IT. SOMEBODY BOUGHT THAT.' },
    ],
    bossIntro: [
      { a: 'THAT\'S THE LAST ADDRESS ON THE ROUTE.', b: 'SHIP FIRST. CREW. THEN WHOEVER THAT IS.' },
    ],
    partnerDown: [
      { a: 'ONE DOWN. I\'LL TAKE THE BACK LANE.', b: 'FRONT\'S MINE. YOUR BACK\'S OPEN NOW.' },
    ],
    partnerContinue: [
      { a: 'BACK ON THE ROUTE. TAKE THE FRONT.', b: 'NOTED. THAT ONE\'S ON MY TAB.' },
    ],
    combo20: [
      { a: 'FOUR LEFT ON THIS LANE.', b: 'THREE. I TOOK THE ONE BEHIND YOU.' },
      { a: 'NEXT ONE\'S ON YOUR BACK LANE.', b: 'SEEN. KEEP THEM IN A LINE FOR ME.' },
    ],
    results: [
      { a: 'THREE HUNDRED AND NINETY-FOUR LEFT.', b: 'SIX DELIVERED. THAT GOES IN THE LOG.' },
    ],
  },
  'sael+pip': {
    sectionStart: [
      { a: 'TWO WAYS OUT. ONE\'S A DROP.', b: 'THE RIG DROPS ONCE. THEN IT\'S PARTS.' },
      { a: 'FOUR MINUTES OF FLOOR. MAYBE THREE.', b: 'THREE IF I THROW YOU. OFFER STANDS.' },
    ],
    midbossIntro: [
      { a: 'IT STOPS EVERY THIRD SWING. COUNT.', b: 'ALL OF IT HELD ON WITH STRAPS.' },
    ],
    bossIntro: [
      { a: 'HITS BOTH SIDES. BEHIND ISN\'T SAFE.', b: 'STILL HAS TO STAND ON SOMETHING.' },
    ],
    partnerDown: [
      { a: 'ONE LANE SHORT NOW. I\'LL TAKE IT.', b: 'I\'LL WALK IN FIRST NOW. HULL\'S FULL.' },
    ],
    partnerContinue: [
      { a: 'NOTHING\'S MOVED. FRONT LANE\'S YOURS.', b: 'NOTHING\'S BENT THAT MATTERS.' },
    ],
    combo20: [
      { a: 'HE HASN\'T LANDED YET.', b: 'I\'LL BE UNDER HIM WHEN HE COMES DOWN.' },
      { a: 'YOU\'VE ONLY MOVED SIX FEET ALL FIGHT.', b: 'DIDN\'T NEED TO. THEY CAME TO ME.' },
    ],
    results: [
      { a: 'BOOT\'S SCORCHED. HALF AN OUNCE LIGHTER.', b: 'GIVE IT HERE. YOU\'LL HAVE IT BY DAWN.' },
    ],
  },
  'rook+pip': {
    sectionStart: [
      { a: 'NEW FLOOR. TELL ME IT TAKES WEIGHT.', b: 'SEVEN HUNDRED POUNDS. THE RIG\'S HALF.' },
      { a: 'NEW LANTERN. I PAID FOR THE OLD ONE.', b: 'THE OLD ONE WENT IN A KILN.' },
    ],
    midbossIntro: [
      { a: 'A NAME PLATE. AND BORROWED PLANT.', b: 'IT\'S HELD TOGETHER WITH ONE PIN.' },
    ],
    bossIntro: [
      { a: 'SHIP. CREW. THEN WHOEVER THAT IS.', b: 'I\'LL NEED THE LONG CHAIN FOR THAT.' },
    ],
    partnerDown: [
      { a: 'WE\'RE DOWN A HAND. THAT LANE\'S OPEN.', b: 'I\'LL CARRY THE SIDE THEY WERE ON.' },
    ],
    partnerContinue: [
      { a: 'YOU\'RE BACK. THAT COMES OFF THE RANK.', b: 'PATCHING\'S CHEAPER THAN BUYING.' },
    ],
    combo20: [
      { a: 'NOT A MARK ON THE COAT.', b: 'THE HULL EATS THAT ONE FOR FREE.' },
      { a: 'THEY\'RE QUEUEING. NOBODY TOLD THEM TO.', b: 'THAT\'S TWO HUNDRED POUNDS OF QUEUE.' },
    ],
    results: [
      { a: 'SCORE\'S UP. THE SHIP\'S STILL IMPOUNDED.', b: 'I\'LL GO AND LOOK AT HER BOILER.' },
    ],
  },
};

/**
 * What a hero says with nobody to answer: a single-player run, a party that doubled up on one hero, or a pairing
 * with nothing written for this trigger. Alone, `partnerDown` is the hero left as the last one standing and
 * `partnerContinue` is them getting back up, which is the honest reading of both moments without a partner in them.
 * @type {Record<string, Record<string, string[]>>}
 */
export const SOLO = {
  brunhild: {
    sectionStart: ['SOMEBODY BUILT ALL THIS CHEAP.', 'WALK IT ONCE. SEE WHAT\'S LOOSE.'],
    midbossIntro: ['WORK MACHINE. POINTED AT PEOPLE.'],
    bossIntro: ['THAT\'S THE ONE WHO SIGNED.'],
    partnerDown: ['DOWN TO THE LAST ONE. NO SPARES.'],
    partnerContinue: ['PATCHED AND BACK ON THE JOB.'],
    combo20: ['THEY KEEP COMING TO THE HAMMER.', 'NOT ONE OF THEM CHANGED LANE.'],
    results: ['NOBODY\'S REPAIRING THAT LOT.'],
  },
  sael: {
    sectionStart: ['TWO WAYS OUT. BOTH BEHIND ME.', 'FOUR MINUTES END TO END.'],
    midbossIntro: ['MACHINE ON A PERSON. SLOW TO TURN.'],
    bossIntro: ['LAST ADDRESS ON THE ROUTE.'],
    partnerDown: ['ONE LEFT. NO SECOND PASS.'],
    partnerContinue: ['UP. ROUTE\'S STILL THE ROUTE.'],
    combo20: ['NONE OF THEM WATCHED THE BACK LANE.', 'THEY ALL AIM WHERE I WAS.'],
    results: ['STILL OWE THE SAME FOUR HUNDRED.'],
  },
  rook: {
    sectionStart: ['NEW GROUND. SAME PEOPLE GETTING PAID.', 'STAND OFF AND COUNT THEM FIRST.'],
    midbossIntro: ['THAT MACHINE COST MORE THAN MY SHIP.'],
    bossIntro: ['THAT\'S THE SIGNATURE. IN PERSON.'],
    partnerDown: ['ONE LEFT. THAT\'S THE WHOLE MANIFEST.'],
    partnerContinue: ['THAT ONE GOES ON THE TAB.'],
    combo20: ['THEY COME IN ORDER. CHEAPER THAT WAY.', 'STILL ON THE FIRST CYLINDER.'],
    results: ['LOGGED. THE SHIP IS STILL IMPOUNDED.'],
  },
  pip: {
    sectionStart: ['PLENTY OF ROOM TO SWING IN HERE.', 'GROUND TAKES A TON OF US SO FAR.'],
    midbossIntro: ['SOMEBODY BOLTED THAT ONTO A PERSON.'],
    bossIntro: ['ALL THAT KIT AND NONE OF IT THEIRS.'],
    partnerDown: ['ONE MORE RUN IN IT. GAUGE SAYS SO.'],
    partnerContinue: ['STOOD IT BACK UP. IT STILL RUNS.'],
    combo20: ['THAT\'S TWENTY LIFTS WITHOUT A DROP.', 'GOOD SHAPES. THEY STACK.'],
    results: ['NOTHING CRACKED. NICE AFTERNOON.'],
  },
};

/**
 * Boss and mid-boss call-outs, merged onto the defs by content/enemies/index.js. `phase[i]` is spoken on ENTERING
 * phase i — `phase[0]` with the name plate, the rest at the moment the previous phase broke — and `defeat` on the
 * last one going down. Read at runtime from `boss.baseDef.lines`, never `boss.def.lines`: game/boss.js replaces the
 * def wholesale on every phase change.
 * @type {Record<string, { phase: string[], defeat: string }>}
 */
export const BOSS_LINES = {
  boss: {
    phase: [
      'THE VALVES STAY SHUT. THE CITY STAYS UP.',
      'YOU HAVE BROKEN THE CHEAPEST PART.',
      'THE DRAWING COST MORE THAN THE MACHINE.',
    ],
    defeat: 'SOMEONE HAS TO STAND AT THE GAUGE.',
  },
  midboss: {
    phase: [
      'MIND THE CONVEYOR. IT DON\'T STOP.',
      'THE RELIEF\'S WELDED. SAME AS UPSTAIRS.',
      'BOILER\'S GONE. I\'VE STILL GOT A WHISTLE.',
    ],
    defeat: 'KEEP THE BADGE. THE NUMBER GETS REUSED.',
  },
  boss2: {
    phase: [
      'THE SKY IS CLOSED. THAT ORDER STANDS.',
      'THE COAT WAS THEIRS. THE HARNESS IS OURS.',
      'NOBODY CAME UP TO RELIEVE THE WATCH.',
    ],
    defeat: 'SOMEONE WILL HAVE TO STAND THEM DOWN.',
  },
  midboss2: {
    phase: [
      'WHAT IS IN THIS HOLD COMES BACK TO ME.',
      'THAT WINCH COMES OFF MY SCRIP.',
    ],
    defeat: 'WRITE ME OFF WITH THE REST OF THE GEAR.',
  },
  boss3: {
    phase: [
      'GOOD MORNING. NAMES FOR THE LEDGER.',
      'I WILL DO IT MYSELF AND BILL FOR IT.',
      'NO LAMPS. NO HANDS. THE FREEHOLD IS MINE.',
    ],
    defeat: 'ENTER IT UNDER LOSSES. THE BOOK STAYS.',
  },
  midboss3: {
    phase: [
      'THIS KILN HAS NOT GONE OUT IN MY LIFE.',
      'THAT\'S THE KILN OFF. NOW THE SHOVEL.',
    ],
    defeat: 'DON\'T LET IT GO OUT.',
  },
  boss4: {
    phase: [
      'GOOD SEASON. EVERY NET UP THERE IS YOURS.',
      'THAT CANOPY CARRIED MY FATHER.',
      'I AM ON THE NETTING. SAME WORK.',
    ],
    defeat: 'CUT THE LINES. THE SEASON IS IN.',
  },
  midboss4: {
    phase: [
      'YOU ARE PRICED. THE DRUM DOES THE REST.',
      'THAT DRUM IS TWO SEASONS OF SCRIP.',
    ],
    defeat: 'SOMEBODY WILL COME AND WEIGH ME.',
  },
};
