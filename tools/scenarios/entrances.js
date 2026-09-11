// Wave entrance scenarios for tools/playtest.js (issue #30). Receives the harness helpers so this file shares one
// browser, one assert and one results list with the main harness — the same pattern as tools/scenarios/thrown.js.
//
// Each of the four entrances (game/entrances.js ENTRANCES) is spawned onto an empty `?nowaves=1` arena through
// `__game.spawnEntrance` and watched frame by frame, against the ENTRANCE TABLE in that module:
//   TELL      an EntranceTell is on the floor and the unit does NOT exist yet; the tell answers dangerBox(), which
//             is what steers mobs and the autopilot around it (hazards.js laneAroundHazards).
//   APPROACH  the unit exists in the ARRIVING ai state with `entered` false, is drawn and hittable, and takes no
//             actions — it never swings during its own arrival.
//   ARRIVAL   it lands, sits in a punishable window, and only then becomes an ordinary APPROACH enemy.
// Plus the two rules that make the entrances worth having: a hit on a hanging ropeDrop CUTS THE LINE (any hit
// becomes a knockdown), and a unit that has just arrived cannot swing immediately — `firstAttackDelay` is re-armed
// against the landing rather than being burned by the flight.
const PARAMS = 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1';

/** Every entrance's authored budget, mirroring ENTRANCES in src/game/entrances.js. */
const KINDS = [
  { kind: 'teleport', type: 'brassbound', variant: 'warden', tell: 40, arrive: 12, air: false },
  { kind: 'flyIn', type: 'stormcrow', variant: 'corsair', tell: 30, arrive: 20, air: true },
  { kind: 'descend', type: 'gleaning', variant: 'chaff', tell: 0, arrive: 30, air: true },
  { kind: 'ropeDrop', type: 'stormcrow', variant: 'marine', tell: 20, arrive: 18, air: true },
];

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function entrances(server, { withPage, assert }) {
  await withPage(server, PARAMS, async (g) => {
    await g.step(30);

    // -- local helpers. Entrance state lives on the Enemy and on an `fx` tell entity, neither of which the
    // `summary()` contract exposes, so this reaches into world.entities the way tools/scenarios/thrown.js does. --
    const clear = () => g.eval(() => {
      window.__game.killAllEnemies();
      for (const e of window.__game.world.entities) if (e.kind === 'fx' || e.kind === 'item') e.removeMe = true;
      const st = window.__game.world.stage; if (st) st.pending.length = 0;
    });
    const tells = () => g.eval(() => window.__game.world.entities
      .filter((e) => e.isHazard && e.look !== undefined && !e.removeMe)
      .map((e) => ({ look: e.look, t: e.t, life: e.life, box: e.dangerBox() })));
    const mobs = () => g.eval(() => window.__game.world.entities
      .filter((e) => e.kind === 'enemy' && !e.removeMe)
      .map((e) => ({ ai: e.aiState, entered: e.entered, y: Math.round(e.y), x: Math.round(e.x), state: e.state,
        punishable: !!e.punishable, arriveT: e.arriveT, cooldown: e.attackCooldown, hp: e.hp })));
    const fire = (type, variant, kind, opts) => g.eval(([t, v, k, o]) => !!window.__game.spawnEntrance(t, v, k, o), [type, variant, kind, opts]);
    /** Step until `pred` holds over the enemy list, up to `max` frames; returns the frames spent, or -1. */
    const until = async (pred, max = 400) => {
      for (let i = 0; i <= max; i++) { if (pred(await mobs())) return i; await g.step(1); }
      return -1;
    };

    for (const k of KINDS) {
      await clear();
      await g.step(2);
      assert((await mobs()).length === 0, `${k.kind}: the arena starts empty`);
      await fire(k.type, k.variant, k.kind, { z: 70 });
      await g.step(1);

      // (a) the tell comes FIRST: for every kind that has one, it is on the floor and the unit does not exist yet
      if (k.tell > 0) {
        const t = await tells();
        assert(t.length === 1, `${k.kind}: one tell is placed before the unit exists (got ${t.length})`);
        assert((await mobs()).length === 0, `${k.kind}: no unit exists during the tell`);
        assert(!!t[0] && !!t[0].box, `${k.kind}: the tell answers dangerBox(), so laneAroundHazards steers around it`);
        // the unit arrives on the tell's own schedule, not before it
        await g.step(k.tell - 2);
        assert((await mobs()).length === 0, `${k.kind}: still no unit two frames before the tell ends`);
        await g.step(3);
      }
      const born = await mobs();
      assert(born.length === 1, `${k.kind}: the unit exists once the tell has run (got ${born.length})`);

      // (b) the approach: ARRIVING, `entered` false (so the wave lock still counts it and it is not lock-clamped),
      // and airborne for every kind that comes out of the sky
      assert(born[0].ai === 'ARRIVING', `${k.kind}: the unit spawns in the ARRIVING ai state (got ${born[0].ai})`);
      assert(born[0].entered === false, `${k.kind}: \`entered\` stays false through the arrival`);
      if (k.air) assert(born[0].y > 0, `${k.kind}: the unit is still in the air on arrival (y=${born[0].y})`);

      // (c) Everything else about the arrival is sampled in ONE pass, because every fact here is true only on
      // particular frames: `punishable` is re-derived from anim frames every step once the unit is an ordinary
      // enemy, and `attackCooldown` starts ticking down the moment the arrival ends. Watching for them in
      // separate loops lets an earlier loop consume the window a later one is looking for — which is exactly how
      // an earlier version of this scenario failed against correct code (teleport's arrival is only 12 frames).
      let swung = false, sawPunish = false, after = null;
      for (let i = 0; i < 400 && !after; i++) {
        const m = (await mobs())[0];
        if (!m) break;
        if (m.ai !== 'ARRIVING') { after = m; break; }   // the first frame it is no longer arriving
        if (m.state === 'ATTACK' || m.state === 'SPECIAL') swung = true;
        if (m.punishable && m.y === 0) sawPunish = true;
        await g.step(1);
      }
      assert(!swung, `${k.kind}: the unit takes no action while it is arriving`);
      assert(sawPunish, `${k.kind}: the arrival ends in a punishable window on the floor`);
      assert(!!after, `${k.kind}: the arrival finishes and hands over to the AI`);
      assert(!!after && after.entered === true, `${k.kind}: \`entered\` is true once the arrival is over`);
      assert(!!after && after.arriveT === 0, `${k.kind}: the arrival counter is cleared (it is hashed by net/checksum.js)`);
      // the flight must not have burned the first-attack grace: a unit that lands swinging is not punishable at all
      assert(!!after && after.cooldown > 0, `${k.kind}: firstAttackDelay is re-armed against the landing (got ${after && after.cooldown})`);
    }

    // (d) ropeDrop, the entrance's own rule: ANY hit on a unit still hanging on its line cuts it.
    //
    // Two subjects, deliberately. Cutting a line is about the LINE, not about the body on it — so it has to work
    // on a SHIELDED unit (the Marine, which is exactly who rope-drops onto the Cold Sovereign) whose super armor
    // swallows the hit reaction entirely. The knockdown rewrite is only observable on an unarmored one.
    const hangAndHit = async (type, variant) => {
      await clear();
      await g.step(2);
      await fire(type, variant, 'ropeDrop', { z: 70 });
      await g.step(20 + 20 + 4);   // tell (20) + slide (20) puts it on the line; the hang is 30 frames long
      const hanging = (await mobs())[0];
      assert(!!hanging && hanging.ai === 'ARRIVING' && hanging.y > 0, `ropeDrop/${variant}: the unit hangs on the line before it lets go (y=${hanging && hanging.y})`);
      await g.eval(() => {
        const w = window.__game.world, e = w.entities.find((q) => q.kind === 'enemy' && !q.removeMe);
        e.takeHit({ damage: 4, type: 'light', kbX: 0, kbY: 0, hitstun: 10 }, w.players[0]);
      });
      return hanging.y;
    };

    // unarmored: the hit is rewritten to a knockdown whatever it was, so a jab is enough to bring the body down
    await hangAndHit('stormcrow', 'deckhand');
    const cut = await until((m) => !!m[0] && (m[0].state === 'KNOCKDOWN' || m[0].state === 'HURT_AIR'), 30);
    assert(cut >= 0, 'ropeDrop: a jab on an unarmored hanging unit is rewritten to a knockdown');

    // shielded: the Marine's armor eats the reaction, but the line is cut all the same and it comes down early.
    // Without the cut it would hang out its full 30 frames at that height, so landing well inside that is the proof.
    const hangY = await hangAndHit('stormcrow', 'marine');
    const fell = await until((m) => !!m[0] && m[0].y === 0, 40);
    assert(fell >= 0, `ropeDrop: the cut line drops even a shielded body, whose armor swallows the hit (hung at ${hangY})`);
  });
}
