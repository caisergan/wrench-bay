// Away-feedback page: the measured tap timeline, the walk-away demo (the game's own sfx with step 1's placement)
// and the two new sounds.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { sfx, unlockAudio } from '/src/ui/audio.js';
import { ICON } from '/src/ui/icons.js';

const $ = (s) => document.querySelector(s);

// ---------------------------------------------------------------- tap timeline
// Recorded 2026-11-14 in the Search browser: town preset save, player teleported to the diner, every ui.sfx call
// logged for 60 s. dev = origin/dev (aaf9a3c), each call whose name had a haptic, after sfx()'s own throttle.
// step 1 = branch sound-scope, calls with haptic !== false. Times in ms.
const DEV = '1474:drop,1957:lift,3441:drop,3590:drop,3758:drop,5625:fix,5690:drop,5842:drop,6024:drop,6189:drop,7491:fix,7607:fix,8941:drop,9192:fix,9193:done,9196:lift,9374:drop,9540:drop,9624:coin,9674:coin,9740:coin,9807:coin,9857:coin,9874:fix,9925:coin,9974:coin,10041:coin,10857:fix,11808:fix,11809:done,11810:lift,12228:coin,12295:coin,12361:coin,12411:coin,12478:coin,12528:coin,13845:fix,13845:done,13846:lift,14278:coin,14328:coin,14396:coin,14444:coin,14511:coin,14578:coin,14628:coin,14695:coin,14744:coin,14811:coin,16144:drop,16795:drop,17278:lift,18127:fix,18128:done,18129:lift,18562:coin,18611:coin,18678:coin,18728:coin,22594:drop,23078:lift,26245:coin,26311:coin,26394:coin,26478:coin,28094:drop,28878:drop,29161:fix,29162:done,29163:lift,29594:coin,29645:coin,29711:coin,29761:coin,31594:coin,31678:coin,31745:coin,31828:coin,34628:drop,34778:drop,34944:drop,35112:drop,36344:drop,36611:drop,36678:fix,36829:lift,37278:coin,37344:coin,37428:coin,37512:coin,38562:fix,39111:fix,39112:done,39113:lift,39544:coin,39594:coin,39628:fix,39661:coin,39711:coin,40944:fix,40945:done,40946:lift,41378:coin,41428:coin,41494:coin,41544:coin,41611:coin,41678:coin,41728:coin,41794:coin,41844:coin,41911:coin,42627:coin,42694:coin,42778:coin,42861:coin,43628:drop,44112:lift,44594:drop,44761:drop,45711:fix,46778:fix,46778:done,46779:lift,47212:coin,47261:coin,47327:coin,47377:coin,47444:coin,47511:coin,47977:coin,48044:coin,48127:coin,48211:coin'
  .split(',').map((s) => { const [t, n] = s.split(':'); return { t: +t, n }; });
const KIND = {
  coin: { c: '#f6c453', label: 'cash landing on a pile' },
  drop: { c: '#7fd6c9', label: 'a part dropped in a car' },
  fix: { c: '#f26b5b', label: 'a mechanic\'s fix' },
  lift: { c: '#a98de0', label: 'a lift going up or down' },
  done: { c: '#5fd38d', label: 'a car done' },
};
{
  const ticks = DEV.map((e) => `<i style="left:${(e.t / 600).toFixed(2)}%;background:${KIND[e.n].c}"></i>`).join('');
  $('#tl').innerHTML =
    `<span class="lab dev">dev today</span><div class="lane">${ticks}</div><span class="num dev">${DEV.length}</span>` +
    `<span class="lab s1">step 1</span><div class="lane"><span class="none">no vibration: none of these was yours</span></div><span class="num s1">0</span>` +
    '<div class="axis"><span>0 s</span><span>15 s</span><span>30 s</span><span>45 s</span><span>60 s</span></div>';
  const count = {};
  for (const e of DEV) count[e.n] = (count[e.n] || 0) + 1;
  $('#legend').innerHTML = Object.keys(KIND).sort((a, b) => count[b] - count[a])
    .map((k) => `<span style="--c:${KIND[k].c}">${count[k]}× ${KIND[k].label}</span>`).join('');
}

// ---------------------------------------------------------------- walk-away demo
// Same numbers as ctx.sfxAt (world.js) in the phone frame: viewReach.x = 12, fade = 12 m.
const REACH = 12, FADE = 12;
let side = -1, dist = 0, playing = 0;
function place() {
  const k = Math.max(0, 1 - dist / FADE), vol = k * k;
  const dx = side * (REACH + dist);
  const pan = Math.max(-1, Math.min(1, dx / (REACH + FADE))) * 0.6;
  const cutoff = vol < 0.999 ? 900 + 15000 * vol * vol : 20000;
  return { vol, pan, cutoff };
}
function render() {
  const { vol, pan, cutoff } = place();
  $('#distTxt').textContent = `${dist} m`;
  $('#mVol').style.width = `${vol * 100}%`; $('#vVol').textContent = `${Math.round(vol * 100)}%`;
  const bright = Math.log(cutoff / 900) / Math.log(20000 / 900);
  $('#mMuf').style.width = `${bright * 100}%`; $('#vMuf').textContent = vol < 0.999 ? `${(cutoff / 1000).toFixed(1)} kHz` : 'full';
  $('#mPan').style.width = `${Math.abs(pan) / 0.6 * 100}%`;
  $('#vPan').textContent = Math.abs(pan) < 0.01 ? 'centre' : `${Math.round(Math.abs(pan) * 100)}% ${pan < 0 ? 'L' : 'R'}`;
  // the little map: screen in the middle, garage moves out along its side; the dashed ring is where it goes silent
  const map = $('#map').getBoundingClientRect(), sw = 92, sh = 150, px = 46 / REACH;
  const ring = $('#ring');
  ring.style.width = `${sw + 2 * FADE * px}px`; ring.style.height = `${sh + 2 * FADE * px}px`;
  const g = $('#gar');
  const ox = side === 0 ? 0 : side * (sw / 2 + 6 + dist * px), oy = side === 0 ? sh / 2 + 6 + dist * px : 0;
  g.style.left = `${map.width / 2 + ox}px`; g.style.top = `${map.height / 2 + oy}px`;
  g.style.opacity = String(0.35 + 0.65 * vol);
}
$('#gar').innerHTML = ICON.wrench;
$('#dist').addEventListener('input', (e) => { dist = +e.target.value; render(); });
for (const b of document.querySelectorAll('#side .btn')) {
  b.addEventListener('click', () => {
    side = +b.dataset.s;
    for (const x of document.querySelectorAll('#side .btn')) x.classList.toggle('on', x === b);
    render();
  });
}
// one garage beat every 4 s: a part lands, the lift goes up, six wrench clicks, a fix, the car pays out
const BEAT = [[0, 'drop'], [450, 'lift'], [1300, 'wrench'], [1470, 'wrench'], [1640, 'wrench'], [1810, 'wrench'], [1980, 'wrench'],
  [2150, 'wrench'], [2350, 'fix'], [2900, 'coin'], [2965, 'coin'], [3030, 'coin'], [3095, 'coin'], [3160, 'coin']];
let timers = [];
function beat() {
  for (const [at, name] of BEAT) timers.push(setTimeout(() => { const { vol, pan } = place(); sfx(name, { vol, pan, haptic: false }); }, at));
}
$('#play').addEventListener('click', () => {
  unlockAudio();
  if (playing) { clearInterval(playing); playing = 0; timers.forEach(clearTimeout); timers = []; $('#play').textContent = 'Play the garage'; return; }
  beat(); playing = setInterval(beat, 4000);
  $('#play').textContent = 'Stop';
});
addEventListener('resize', render);
render();

// ---------------------------------------------------------------- the two new sounds (the game's own, ui/audio.js)
const play = (name) => { unlockAudio(); sfx(name, { haptic: false }); };
$('#hCall').addEventListener('click', () => play('call'));
$('#hRadio').addEventListener('click', () => play('radio'));
$('#hCashOld').addEventListener('click', () => play('cash'));
$('#hCashNew').addEventListener('click', () => play('homecoming'));
