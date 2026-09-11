// Weapon pickups scenario for tools/playtest.js (issue #20). Receives the harness helpers so this
// file shares one browser, one assert and one results list with the main harness. tools/playtest.js
// is already close to its ~700-line budget, so this scenario lives in its own sibling module (see
// tools/playtest-options.js for the same pattern) and is merged into the `scenarios` object there.
//
// Covers (docs/GDD.md section 7, docs/ARCHITECTURE.md section 13 "3c"): each of the four enemy
// weapons drops on death and can be picked up with its full durability; a connecting swing spends
// one hit; the weapon shatters (no pickup left behind) once its hits run out; a knockdown drops the
// weapon on the ground with its remaining hits intact and a partner can pick it up; entering the next
// stage section discards a carried weapon (GDD 7 "never carried across"); and a hero who is already
// armed walks over another weapon without swapping.
/**
 * @param {{ withPage: Function, assert: Function }} deps
 * @returns {{ weapons: Function }}
 */
export function weaponScenarios({ withPage, assert }) {
  return {
    async weapons(server) {
      await withPage(server, 'seed=1&skipTo=gameplay&chars=0,1&nowaves=1&godmode=1', async (g) => {
        await g.step(30);

        // -- local helpers (game/items.js WeaponPickup, game/player.js, main.js spawnWeapon) --
        const pickups = () => g.eval(() => window.__game.world.entities
          .filter((e) => e.kind === 'item' && e.weaponId && !e.removeMe)
          .map((e) => ({ id: e.weaponId, hits: e.weaponHits, x: e.x, z: e.z })));
        const clearItems = () => g.eval(() => {
          for (const e of window.__game.world.entities) if (e.kind === 'item') e.removeMe = true;
        });
        const park = (slot, z) => g.eval(([sl, zz]) => { window.__game.world.players[sl].z = zz; }, [slot, z]);
        const spawnWeapon = (id, dx, dz) => g.eval(([i, x, z]) => window.__game.spawnWeapon(i, x, z), [id, dx, dz]);
        // Attacker null: Enemy.takeHit's riposte branches need attacker.kind === 'player' (enemy.js:494-499)
        // and can never fire, so the kill always lands; World.onDeath spawns the drop without a killer.
        const killFirst = () => g.eval(() => {
          const w = window.__game.world, e = w.enemies[0];
          e.invuln = 0;
          e.takeHit({ damage: 9999, type: 'knockdown', kbX: 0, kbY: 4 }, null);
        });
        const walkOnto = async (slot, d) => {
          await g.eval(([sl, x, z]) => { const p = window.__game.world.players[sl]; p.x = x; p.z = z; }, [slot, d.x - 40, d.z]);
          for (let i = 0; i < 24; i++) {
            const s = await g.summary();
            if (s.players[slot] && s.players[slot].weapon) return;
            await g.press(slot, { right: true }, 4, 0);
          }
        };
        // The weapon swings are deliberately slow (GDD 7: "long slow thrust" etc.) and a connecting
        // hit applies its own hitstop, so a swing in flight when its last hit lands can still take a
        // while to actually finish playing out. Bound-wait for `actionable` before relying on a
        // walk-over pickup landing on the very next tick.
        const waitActionable = async (slot, max = 150) => {
          for (let i = 0; i < max; i++) {
            if (await g.eval((sl) => window.__game.world.players[sl].actionable, slot)) return true;
            await g.step(1);
          }
          return false;
        };

        // P2 parked well clear of P1's 14 px pickup-box z-band so it never trips a walk-over meant
        // for P1 alone; P1 pinned to a known z too, so drop coordinates are predictable.
        await park(1, 130);
        await park(0, 40);

        // (a) Every enemy weapon drops on death with its full durability and can be picked up.
        const drops = [
          ['brassbound', 'halberdier', 'halberd', 12],
          ['stormcrow', 'corsair', 'cutlass', 15],
          ['chandler', 'limeburner', 'limerake', 10],
          ['brassbound', 'duelist', 'sabre', 8],
        ];
        for (const [type, variant, id, hits] of drops) {
          await g.killEnemies();
          await clearItems();
          await g.spawnEnemy(type, variant, 60, 0);
          await g.step(2);
          await killFirst();
          await g.step(90);
          const drop = (await pickups()).find((d) => d.id === id);
          assert(!!drop, `${variant} drops a ${id} on death`);
          if (drop) await walkOnto(0, drop);
          const s = (await g.summary()).players[0];
          assert(s.weapon === id && s.weaponHits === hits, `${variant}'s ${id} carries ${hits} hits on pickup (got ${s.weapon}/${s.weaponHits})`);
          await g.eval(() => window.__game.world.players[0].clearWeapon());
        }

        // (b) A connecting swing spends one durability point; the weapon shatters (no pickup left) once spent.
        await g.killEnemies();
        await clearItems();
        await spawnWeapon('halberd', 0, 0);
        await g.step(6);
        let s = (await g.summary()).players[0];
        assert(s.weapon === 'halberd' && s.weaponHits === 12, 'P1 wields the spawned halberd at full durability');
        let sawSpend = false, lastHits = null, breakState = null, broke = false;
        for (let i = 0; i < 60 && !broke; i++) {
          const enemyCount = (await g.summary()).enemies.length;
          if (enemyCount < 1) await g.spawnEnemy('typeA', 'grunt', 45, 0);
          if (enemyCount < 2) await g.spawnEnemy('typeA', 'grunt', 65, 0);
          await g.eval(() => window.__game.facePlayerToNearestEnemy(0));
          await g.press(0, { attack: true }, 2, 14);
          const ps = (await g.summary()).players[0];
          if (!sawSpend && ps.weapon === 'halberd' && ps.weaponHits < 12) {
            await g.shot('90-weapons-swing');
            sawSpend = true;
          }
          if (ps.weaponHits > 0) lastHits = ps.weaponHits;
          if (ps.weapon === '') { broke = true; breakState = ps.state; }
        }
        assert(sawSpend, 'a connecting swing spends durability');
        assert(broke, 'the halberd shatters after its hits are spent');
        assert(lastHits !== null && lastHits <= 2, `the empty reading came from the final swing, not a knockdown drop (last non-zero reading was ${lastHits})`);
        assert(!['KNOCKDOWN', 'LYING', 'GETUP', 'HURT'].includes(breakState), `the halberd broke from a swing, not a knockdown (state was ${breakState})`);
        const afterBreak = await pickups();
        assert(afterBreak.every((d) => d.id !== 'halberd'), 'a shattered weapon leaves no pickup');

        // (c) A knockdown drops the weapon on the ground with its hits intact; a partner can pick it up.
        await g.killEnemies();
        await clearItems();
        await waitActionable(0); // let the halberd's last (slow) swing actually finish before rearming
        await spawnWeapon('cutlass', 0, 0);
        await g.step(6);
        s = (await g.summary()).players[0];
        assert(s.weapon === 'cutlass', 'P1 wields the spawned cutlass');
        // damage 10 (not the plan's illustrative 1): Brunhild's traits.ignoreKnockdownBelow is 10
        // (content/characters/brunhild.js) and fighter.js demotes a knockdown/launch hit below that
        // threshold to a 'heavy' flinch before Player.knockDown() (and its dropWeapon() override) is
        // ever reached, godmode or not (it only zeroes the applied hp, not hit.damage). damage: 10 is
        // the smallest value that keeps the hit an actual knockdown so dropWeapon() fires.
        await g.eval(() => {
          const p = window.__game.world.players[0];
          p.invuln = 0;
          p.takeHit({ damage: 10, type: 'knockdown', kbX: 0, kbY: 4 }, null);
        });
        // WEAPON_DROP_GRACE (game/weapons.js) is 20: one step in, the fresh drop's grace has ticked
        // down by exactly one.
        await g.step(1);
        const grace0 = await g.eval(() => window.__game.world.entities.find((e) => e.kind === 'item' && e.weaponId === 'cutlass').grace);
        assert(grace0 === 19, 'a player drop starts its pickup grace');
        await g.step(29);
        s = (await g.summary()).players[0];
        const cutlassDrop = (await pickups()).find((d) => d.id === 'cutlass' && d.hits === 15);
        assert(s.weapon === '' && !!cutlassDrop, 'a knockdown drops the weapon with its hits intact');
        // The dropper itself can re-take the weapon once its own grace has expired.
        await waitActionable(0);
        await walkOnto(0, cutlassDrop);
        assert((await g.summary()).players[0].weapon === 'cutlass', 'the dropper can re-take its own weapon after the grace');
        await g.eval(() => window.__game.world.players[0].dropWeapon());
        await g.step(30); // let the re-drop's own grace expire before the partner walks onto it
        // Move P1 off the drop before the partner walks in: P1 is back in IDLE ~80 frames after the
        // hit and would otherwise re-collect its own drop first (WeaponPickup.update walks players
        // in slot order).
        await g.eval(() => {
          const w = window.__game.world, p = w.players[0];
          p.x = Math.max(w.camera.x + 30, p.x - 150);
        });
        const drop = (await pickups()).find((d) => d.id === 'cutlass');
        if (drop) await walkOnto(1, drop);
        const after = await g.summary();
        assert(after.players[1].weapon === 'cutlass', 'the partner can pick up a dropped weapon');
        assert(after.players[0].weapon === '', 'P1 stays unarmed after dropping its weapon on knockdown');
        await g.shot('91-weapons-drop');

        // (d) Section rule: a carried weapon is not carried into the next stage section.
        await g.eval(() => window.__game.world.stage.enterSection(1));
        await g.step(2);
        s = (await g.summary()).players[1];
        assert(s.weapon === '', 'weapons are not carried into the next section');

        // (e) An armed hero walks over another weapon without swapping (a swap would drop the old
        // weapon underfoot and the walk-over test would pick it straight back up).
        await park(1, 130);
        await park(0, 40);
        await waitActionable(0); // clear of the (c) knockdown/getup recovery before rearming
        await spawnWeapon('halberd', 0, 0);
        await g.step(6);
        s = (await g.summary()).players[0];
        assert(s.weapon === 'halberd', 'P1 wields the halberd');
        await spawnWeapon('sabre', 0, 0);
        await g.step(10);
        const final = await g.summary();
        const sabreDrop = (await pickups()).find((d) => d.id === 'sabre');
        assert(final.players[0].weapon === 'halberd', 'an already-armed P1 keeps its halberd');
        assert(!!sabreDrop, 'the sabre pickup remains uncollected');
        assert(final.players[1].weapon === '', "the unrelated partner slot isn't touched by the no-swap check");

        // (f) Gallery: a hero + weapon cell exists for every pickup weapon (main.js weaponGalleryEntries).
        const ids = await g.eval(() => window.__game.game.galleryRegistry.map((e) => e.id));
        for (const id of ['halberd', 'cutlass', 'limerake', 'sabre']) {
          assert(ids.some((gid) => gid.endsWith(':' + id)), 'gallery has a hero + ' + id + ' cell');
        }

        // (g) Vanish timer: a weapon pickup disappears after PICKUP_LIFE (items.js) frames, same as
        // food/cogs/vials. Placed well clear of both players' 14 px pickup-box z-band so neither trips
        // a walk-over during the 601-frame wait.
        await clearItems();
        await park(0, 40);
        await park(1, 130);
        await spawnWeapon('cutlass', 120, 60);
        await g.step(601);
        assert((await pickups()).every((d) => d.id !== 'cutlass'), 'a weapon pickup vanishes after 10 s (PICKUP_LIFE)');
      });

      // (h) An unthreatened bot walks over a nearby weapon pickup and wields it (game/bot.js botIntent).
      await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1&bot=1', async (g) => {
        await g.step(30);
        await g.eval(([i, x, z]) => window.__game.spawnWeapon(i, x, z), ['halberd', 90, 0]);
        await g.step(120);
        assert((await g.summary()).players[0].weapon === 'halberd', 'an unthreatened bot walks over a nearby weapon');
      });
    },
  };
}
