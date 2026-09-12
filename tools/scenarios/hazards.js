// Hazard scenarios for tools/playtest.js. Receives the harness helpers so this file shares one browser, one assert
// and one results list with the main harness — the same pattern as tools/scenarios/obstacles.js.
//
// What is asserted here is the part of a hazard that is SEQUENCING rather than rendering: the promise its tell makes
// and whether the hazard keeps it. Board 3's runaway lime wagon is the one hazard that travels the board, and it is
// the one where that can come apart — Hazard.update() is gated on the camera (every section's hazards are in the
// world from Stage.start(), so an off-camera hazard must not run), and gating a MOVING hazard on where its wheels
// are this frame froze it on its chocks the moment the camera lost them. The wagon rocked, blinked its brake lamp
// and sounded its tell, and then nothing came down the road.
//
// The hazards are the real authored ones rather than test fixtures, so these assertions also prove the content is
// placed sanely: the Lime Road wagon as authored in src/content/stage/stage3.js.
const LIME_ROAD = 'seed=1&skipTo=gameplay&chars=0&stage=3&section=0&godmode=1';
/** Camera x with the wagon's chocks (x 1780) on screen, and the 130px of ground the party gives up after the tell. */
const ON_CHOCKS = 1100, GAVE_GROUND = 970;

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function hazards(server, { withPage, assert }) {
  await withPage(server, LIME_ROAD, async (g, page) => {
    // the hazard's own sounds are the tell (`hydraulic`) and the wagon coming off its chocks (`crate_drop`), so the
    // warning is only observable through audio.play — wrap it and read back what was heard on each frame
    await page.evaluate(() => {
      window.__sfx = [];
      const a = window.__game.audio, play = a.play.bind(a);
      a.play = (n) => { window.__sfx.push(n); return play(n); };
    });
    // Park the camera by hand rather than walking there: the assertion is about where the CAMERA is, and a wave lock
    // or a knockdown would otherwise decide that instead. The player rides along so the world keeps its section.
    const step = (camx) => page.evaluate((cx) => {
      const w = window.__game.world, p = w.players[0];
      p.x = cx + 320; p.z = 70; p.vx = 0; p.hp = p.maxHp;
      window.__game.killAllEnemies();
      window.__game.step(1);
      w.camera.x = cx;                                   // re-pin after the step: camera.update() follows the player
      const h = w.entities.find((e) => e.type === 'wagon');
      return { t: h.t, phase: h.phase, wagonX: Math.round(h.wagonX), x: h.x, x1: h.x1, sfx: window.__sfx.splice(0) };
    }, camx);
    /** Step until `done` reads true, or give up after `frames`. */
    const until = async (camx, frames, done) => {
      let s = await step(camx);
      for (let i = 0; i < frames && !done(s); i++) s = await step(camx);
      return s;
    };

    let s = await step(ON_CHOCKS);
    assert(s.x === 1780 && s.x1 === 20, `the Lime Road wagon runs the length of the road (${s.x} -> ${s.x1})`);

    // (a) THE WARNING. The wagon is parked on camera, so the frame its tell phase opens is the frame it is heard.
    s = await until(ON_CHOCKS, 1200, (r) => r.phase === 'idle');       // start of a cycle, whichever one we joined on
    s = await until(ON_CHOCKS, 1200, (r) => r.phase === 'tell');
    assert(s.phase === 'tell', 'the wagon reaches its tell phase');
    assert(s.sfx.includes('hydraulic'), `and sounds its tell on the frame it opens (heard: ${JSON.stringify(s.sfx)})`);

    // (b) THE CART. The party gives ground 130px while it is telling — which used to put the wagon's chocks past the
    // camera's margin and freeze the run dead — and the wagon still comes all the way down the road.
    s = await until(ON_CHOCKS, 120, (r) => r.phase === 'active');
    const start = s.wagonX;
    s = await until(GAVE_GROUND, 600, (r) => r.wagonX <= 200 || r.phase !== 'active');
    assert(s.wagonX <= 200, `the wagon the tell promised rolls the whole road even after the party gives ground (${start} -> ${s.wagonX})`);

    // (c) and it goes back on its chocks for the next cycle rather than staying where it stopped
    s = await until(GAVE_GROUND, 300, (r) => r.phase === 'idle');
    assert(s.phase === 'idle' && s.wagonX === s.x, `and is back on its chocks for the next run (${s.wagonX})`);

    // (d) OFF THE BOARD. The Ledger House is three sections on; the road's wagon must not be running there, or every
    // section's hazards would be running at once (they are all in the world from Stage.start()). An unstepped wagon
    // never leaves its chocks, whatever phase its clock says it is in.
    let moved = false, sawActive = false;
    for (let i = 0; i < 700; i++) {
      s = await step(4600);
      if (s.phase === 'active') sawActive = true;
      if (s.wagonX !== s.x) moved = true;
    }
    assert(sawActive, 'the wagon cycles on through its active phase while the party is in the Ledger House');
    assert(!moved, 'but it is not stepped there: it stays on its chocks once the party has left the road');
  });
}
