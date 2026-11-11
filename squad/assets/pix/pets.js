/* 펫 도트(ENDGAME.md 6절): 지역마다 한 마리, 여섯 마리. 길 위에서는 뒷모습(영웅 16×20보다 작게, 걷기 두 장), 화면에는 얼굴 한 장(고르기·키우기).
   art.js를 가져오지 않는 그림 모듈 — SHEETS에 펼쳐 부팅 때 함께 굽는다(작다: 여섯 마리 합쳐 영웅 한 명보다 훨씬 적다) */
const K = '#2B1D2E';
const two = (body, legsA, legsB) => [body.concat(legsA), body.concat(legsB)];
const BACK = {
  fox: {
    pal: { f: '#E8B86A', F: '#B97A32', w: '#FFF4DC', k: '#6B4420' },
    frames: two(['F.......F', 'Ff.....fF', 'Fff...ffF', '.fffffff.', 'fffffffff', 'fffffffff', '.fffFfff.', '.ffFwFff.'], ['..f...f..'], ['.f.....f.']),
  },
  penguin: {
    pal: { n: '#2F3A5C', N: '#1E2540', w: '#F4F7FF', o: '#FFA53C' },
    frames: two(['...nnn...', '..nnnnn..', '..nnnnn..', '.wnnnnnw.', 'wwnnNnnww', '.wnnNnnw.', '..nnnnn..', '..nnnnn..'], ['..oo.oo..'], ['.oo...oo.']),
  },
  cat: {
    pal: { g: '#B9B4C8', G: '#7F7892', p: '#FFB0CC' },
    frames: two(['g.......g', 'gg.....gg', 'ggggggggg', '.gGgGgGg.', '.ggggggg.', '.gGgGgGgG', '.ggggggGG', '.gggggg.G'], ['..g...g..'], ['.g.....g.']),
  },
  sprite: {
    pal: { r: '#FF5A6E', R: '#C93A52', w: '#FFF4F0', c: '#FFE9C4', C: '#D9B98A' },
    frames: two(['...rrr...', '..rwrrr..', '.rrrrrwr.', 'rrwrrrrrr', 'rrrrrwrrR', '.RRRRRRR.', '...ccc...', '...cCc...'], ['..c...c..'], ['...c.c...']),
  },
  newt: {
    pal: { o: '#FF8A3C', O: '#C95A1E', y: '#FFE066', r: '#FF4A3C' },
    frames: two(['..ooooo...', '.ooooooo..', '.oOoOoOo..', 'ooooooooo.', '.ooooooo.y', '..ooooo.yr', '...ooo.yry'], ['.o.....o..'], ['..o...o...']),
  },
  puppy: {
    pal: { p: '#FF9FD0', P: '#FFD6EC', d: '#D9609E' },
    frames: two(['pp.....pp..', 'pPp...pPp..', '.ppppppp...', '.pPppppp...', 'ppppppppp..', 'ppppppppp.d', '.ppppppp.pd', '.ppdddpp.p.'], ['.pp...pp...'], ['..pp.pp....']),
  },
};
const FACE = {
  fox: { pal: { f: '#E8B86A', F: '#B97A32', w: '#FFF4DC', k: K, p: '#FF8FB8' }, rows: ['F.........F', 'FF.......FF', 'FfF.....FfF', 'FffffffffF.', '.fffffffff.', '.fkfffffkf.', '.fkfffffkf.', '.wwffkffww.', '..wwwwwww..', '...wwpww...', '....www....'] },
  penguin: { pal: { n: '#2F3A5C', w: '#F4F7FF', o: '#FFA53C', k: K, p: '#FFB0CC' }, rows: ['...nnnnn...', '..nnnnnnn..', '.nnnnnnnnn.', '.nwwnnnwwn.', '.nwkwnwkwn.', '.nwwwwwwwn.', '.npwwoowpn.', '.nwwwoowwn.', '..nwwwwwn..', '...nnnnn...'] },
  cat: { pal: { g: '#B9B4C8', G: '#7F7892', k: K, p: '#FFB0CC', y: '#FFE066' }, rows: ['g.........g', 'gg.......gg', 'gpg.....gpg', 'ggggGgGgggg', '.ggggggggg.', '.gyygggyyg.', '.gykgggkyg.', '.ggggpgggg.', '..ggkgkgg..', '...ggggg...'] },
  sprite: { pal: { r: '#FF5A6E', R: '#C93A52', w: '#FFF4F0', c: '#FFE9C4', k: K, p: '#FF9FB0' }, rows: ['...rrrrr...', '.rrrwrrrrr.', 'rrrrrrrwrrr', 'rwrrrrrrrrr', 'RRRRRRRRRRR', '..ccccccc..', '..ckccckc..', '..cpcccpc..', '..ccckccc..', '...ccccc...'] },
  newt: { pal: { o: '#FF8A3C', O: '#C95A1E', y: '#FFE066', r: '#FF4A3C', k: K, w: '#FFF4DC' }, rows: ['....yry....', '...yyryy...', '..ooooooo..', '.ooooooooo.', 'oowkoooowko', 'oowkoooowko', 'ooooooooooo', '.ooOooooOo.', '..ooOOOoo..', '...ooooo...'] },
  puppy: { pal: { p: '#FF9FD0', P: '#FFD6EC', d: '#D9609E', k: K }, rows: ['.pp.....pp.', 'pPpp...ppPp', 'ppppppppppp', '.pPppppppp.', '.pkpppppkp.', '.pkpppppkp.', '.pppdddppp.', '.ppppkpppp.', '..ppdddpp..', '...ppppp...'] },
};
export const PET_SHEETS = {};
export const PET_ART = {};
for (const id of Object.keys(BACK)) {
  PET_SHEETS['pet_' + id] = { pal: BACK[id].pal, frames: BACK[id].frames };
  PET_SHEETS['petf_' + id] = { pal: FACE[id].pal, frames: [FACE[id].rows] };
  PET_ART[id] = { back: 'pet_' + id, face: 'petf_' + id };
}
/* 알(고르기·알 열기 화면) */
PET_SHEETS.pet_egg = { pal: { e: '#FFF4DC', E: '#E6D2B0', s: '#FFC93C', k: K }, frames: [['...eee...', '..eeeee..', '.eeseeee.', '.eeeeese.', 'eeeeeeeee', 'esEeeeeee', 'eeeeeEsee', '.eEeeeee.', '.eeEEEee.', '..EEEEE..']] };
