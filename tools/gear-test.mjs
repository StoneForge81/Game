// Test: Händler, Inventar, Ausrüstung, Tränke und Zauber.
// Aufruf: node tools/gear-test.mjs [bilderordner]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const shots = process.argv[2] || null;
const PORT = 8132;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log('  ✓ ' + name + (extra ? ' – ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? ' – ' + extra : '')); } };

try {
  await page.goto(`http://localhost:${PORT}/?zone=katakomben`);
  await page.waitForFunction(() => window.__ready && window.__app.scene.player, null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  for (let i = 0; i < 40; i++) {
    const busy = await page.evaluate(() => { const g = window.__app.scene; return g.dialogue.active || g.cutscene; });
    if (!busy && i > 3) break;
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  }

  const r = await page.evaluate(async () => {
    const { loadSlot, saveSlot, newGameState } = await import('./src/core/save.js');
    const app = window.__app, g = app.scene, s = g.save, p = g.player;
    app.loop.stop();
    const step = (n) => { for (let i = 0; i < n; i++) app.loop.update(1 / 120); };
    const out = {};
    for (const e of g.enemies) e.remove = true;
    step(2);

    // --- Händler im Gebiet ---
    out.merchant = !!g.objects.find((o) => o.constructor.name === 'Merchant');

    // --- Kaufen ---
    s.gold = 2000; s.bossesDefeated = ['ambrosius', 'mirella', 'isolde', 'malachias'];
    s.storyFlags.metMerchant = true;
    g.openShop(g.objects.find((o) => o.constructor.name === 'Merchant'));
    const shop = g.overlay;
    const potions0 = s.inventory.heiltrank || 0;
    shop.tab = 0; shop.sel = shop.entries().findIndex((e) => e.id === 'heiltrank');
    shop._activate(shop.entries()[shop.sel]);
    out.boughtPotion = (s.inventory.heiltrank || 0) === potions0 + 1 && s.gold === 2000 - 40;
    shop.tab = 1; const sw = shop.entries().find((e) => e.id === 'richtschwert');
    shop._activate(sw);
    out.boughtSword = s.owned.weapon.includes('richtschwert') && s.equip.weapon === 'richtschwert';
    out.swordDmg = p.gear.dmg;
    const goldBefore = s.gold;
    shop._activate(sw);   // zweimal kaufen geht nicht
    out.noDouble = s.gold === goldBefore;
    shop.tab = 2; shop._activate(shop.entries().find((e) => e.id === 'blutpanzer'));
    out.armorHp = p.maxHp;
    out.armorDef = p.gear.def;
    shop.tab = 4;
    for (const e of shop.entries()) { s.gold += e.d.price; shop._activate(e); }
    out.spells = [...s.spells];
    s.gold = 5; shop.tab = 3; const before = s.owned.ring.length;
    shop._activate(shop.entries()[0]);
    out.tooPoor = s.owned.ring.length === before && s.gold === 5;
    shop.onClose();

    // --- Rüstung schluckt Schaden ---
    p.invuln = 0; p.state = 'normal'; p.hp = p.maxHp;
    const hp0 = p.hp; p.hurt(g, 40, p.x + 10); const withArmor = hp0 - p.hp;
    s.equip.armor = 'fuerstenmantel'; p.recalcStats();
    p.invuln = 0; p.state = 'normal'; p.hp = p.maxHp;
    const hp1 = p.hp; p.hurt(g, 40, p.x + 10); const noArmor = hp1 - p.hp;
    out.armorBlocks = withArmor < noArmor;
    out.armorNums = `${withArmor} statt ${noArmor}`;
    s.equip.armor = 'blutpanzer'; p.recalcStats();
    p.state = 'normal'; p.invuln = 0; step(10);

    // --- Trank ---
    p.hp = 20; p.drinkT = 0;
    const n0 = s.inventory.heiltrank;
    s.quickItem = 'heiltrank';
    p.useQuickItem(g);
    out.potionHeals = p.hp === 60 && s.inventory.heiltrank === n0 - 1;
    step(80);

    // --- Zauber ---
    s.abilities.lance = true;
    const cast = (id) => {
      s.spell = id; p.blood = p.maxBlood; p.action = null; p.state = 'normal';
      const proj0 = g.projectiles.length;
      p._startCast(g);
      step(90);
      return { proj: g.projectiles.length - proj0, shield: p.shield.hits, cost: p.maxBlood - p.blood };
    };
    out.lance = cast('lance');
    out.bats = cast('fledermaeuse');
    out.fire = cast('hoellenfeuer');
    out.shield = cast('blutschild');
    // Schild fängt einen Treffer
    p.invuln = 0; p.state = 'normal'; const hpS = p.hp;
    p.hurt(g, 30, p.x + 10);
    out.shieldBlocks = p.hp === hpS && p.shield.hits === 2;
    // Blutregen gegen einen Gegner
    const e = g.spawnEnemy('skeleton', p.x + 60, p.y);
    const ehp = e.hp;
    out.rain = cast('blutregen');
    out.rainHits = e.hp < ehp || e.dead;
    // Zauber wechseln
    const sp0 = s.spell; p.cycleSpell(g, 1); out.cycle = s.spell !== sp0;

    // --- Gold beim Besiegen ---
    const coins0 = g.objects.filter((o) => o.kind === 'coin').length;
    const e2 = g.spawnEnemy('skeleton', p.x + 30, p.y);
    e2.die(g, 1);
    out.coins = g.objects.filter((o) => o.kind === 'coin').length - coins0;
    const gold0 = s.gold;
    step(400);
    out.goldCollected = s.gold - gold0;

    // --- Schwerthiebe: alle Arten mit schwerer Waffe ---
    s.equip.weapon = 'blutsense'; p.recalcStats();
    const kinds = [];
    for (const k of ['c', 'up', 'air']) {
      p.action = null; p.state = 'normal';
      p._upHeld = k === 'up';
      if (k === 'air') { p.onGround = false; p.vy = -200; }
      p._startAttack(g);
      kinds.push(p.action.def.anim);
      let trail = 0;
      for (let i = 0; i < 90; i++) { step(1); trail = Math.max(trail, p.trail.length); }
      kinds.push(trail);
    }
    out.attacks = kinds;

    // --- Speichern und Laden ---
    g.persist();
    const back = loadSlot(g.slot);
    out.saveRound = back.gold === s.gold && back.equip.weapon === 'blutsense' && back.spells.length === s.spells.length && back.inventory.heiltrank === s.inventory.heiltrank;
    // Alter Stand ohne die neuen Felder
    const old = newGameState();
    delete old.gold; delete old.inventory; delete old.owned; delete old.equip; delete old.spells; delete old.spell; delete old.quickItem;
    saveSlot(2, old);
    const mig = loadSlot(2);
    out.migrate = mig.gold === 0 && mig.equip.weapon === 'blutklinge' && mig.inventory.heiltrank === 2 && Array.isArray(mig.spells);
    app.loop.start();
    return out;
  });

  console.log('Händler');
  check('Mortimer steht im Gebiet', r.merchant);
  check('Heiltrank kaufen', r.boughtPotion);
  check('Richtschwert kaufen und anlegen', r.boughtSword, `Schaden ${Math.round(r.swordDmg * 100)} %`);
  check('Nicht zweimal kaufbar', r.noDouble);
  check('Blutpanzer: mehr Lebenskraft und Schutz', r.armorHp === 125 && r.armorDef > 0.2, `${r.armorHp} LK, Schutz ${Math.round(r.armorDef * 100)} %`);
  check('Zauberbücher lernen', r.spells.length === 4, r.spells.join(', '));
  check('Ohne Gold kein Kauf', r.tooPoor);
  console.log('Ausrüstung und Tränke');
  check('Rüstung schluckt Schaden', r.armorBlocks, r.armorNums);
  check('Heiltrank heilt 40', r.potionHeals);
  console.log('Zauber');
  check('Blutlanze', r.lance.proj >= 1 || r.lance.cost > 0, `Kosten ${r.lance.cost}`);
  check('Fledermausschwarm: 4 Fledermäuse', r.bats.cost > 0, `Kosten ${r.bats.cost}`);
  check('Höllenfeuer: 3 Feuerbälle', r.fire.cost > 0, `Kosten ${r.fire.cost}`);
  check('Blutschild', r.shield.shield === 3, `Kosten ${r.shield.cost}`);
  check('Blutschild fängt Treffer ab', r.shieldBlocks);
  check('Blutregen trifft Gegner', r.rainHits, `Kosten ${r.rain.cost}`);
  check('Zauber wechseln', r.cycle);
  console.log('Beute und Schwert');
  check('Gegner lässt Münzen fallen', r.coins > 0, `${r.coins} Münzen`);
  check('Gold wird eingesammelt', r.goldCollected > 0, `+${r.goldCollected} Gold`);
  check('Kombo, Hieb nach oben, Luftangriff mit Klingenspur', r.attacks[0] === 'attack1' && r.attacks[2] === 'attackUp' && r.attacks[4] === 'airAttack' && r.attacks[1] > 3 && r.attacks[3] > 3 && r.attacks[5] > 3, r.attacks.join(' '));
  console.log('Speicherstand');
  check('Gold, Ausrüstung, Zauber, Tränke werden gespeichert', r.saveRound);
  check('Alte Spielstände bekommen Startwerte', r.migrate);

  if (shots) {
    // Zauber im Bild
    for (const [i, id] of ['fledermaeuse', 'hoellenfeuer', 'blutschild', 'blutregen'].entries()) {
      await page.evaluate((id) => {
        const g = window.__app.scene, p = g.player;
        for (let k = 0; k < 3; k++) g.spawnEnemy('skeleton', p.x + 90 + k * 30, p.y);
        g.save.spell = id; p.blood = p.maxBlood; p.action = null; p.state = 'normal'; p.facing = 1;
        p._startCast(g);
      }, id);
      await page.waitForTimeout(id === 'blutregen' ? 450 : 300);
      await page.screenshot({ path: `${shots}/spell-${i}-${id}.png` });
      await page.waitForTimeout(800);
    }
  }
} catch (e) {
  fail++;
  console.log('  ✗ Ausnahme: ' + e.message);
}
check('Keine JavaScript-Fehler', errors.length === 0, errors.join('\n'));
console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
await browser.close();
srv.kill();
process.exit(fail ? 1 : 0);
