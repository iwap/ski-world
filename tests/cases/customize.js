// Customize: färgerna köps och väljs här (inte i butiken), jacka och byxor per karaktär – t.ex. en röd ninja. budget: 30000
runTest(async (t) => {
  save.bank = 20000;
  save.chars = [...new Set([...save.chars, 'ninja'])];
  save.character = 'ninja';
  applyLook();
  showShop();
  t.ok(!$('shop').querySelector('.swatch'), 'färger finns fortfarande i butiken');
  showCustomize();
  t.ok(!$('customize').classList.contains('hidden'), 'Customize öppnas inte');
  const swatch = (id) => $('custom-styles').querySelector(`[data-style="${id}"]`);
  const ninjaJacket = skier.mats.jacket.color.getHexString();
  t.eq(ninjaJacket, '1c1c1c', 'ninjan ska vara svart från början');
  // Köp röd jacka och röda byxor till ninjan
  const bank0 = save.bank;
  swatch('jacket-red').click();
  t.eq(save.bank, bank0 - 3000, 'den röda jackan kostade inte 3000');
  t.eq(skier.mats.jacket.color.getHexString(), 'c62828', 'ninjans jacka blev inte röd');
  swatch('pants-red').click();
  t.eq(skier.mats.pants.color.getHexString(), 'c62828', 'ninjans byxor blev inte röda');
  // Andra karaktärer påverkas inte, och "Original" ger tillbaka ninjans färger
  save.character = 'classic';
  applyLook();
  t.eq(skier.mats.pants.color.getHexString(), CHAR_DEFAULT.pants.slice(1), 'byxorna ändrades på en annan karaktär');
  save.character = 'ninja';
  showCustomize();
  swatch('jacket-orig').click();
  t.eq(skier.mats.jacket.color.getHexString(), '1c1c1c', 'Original gav inte tillbaka ninjans svarta jacka');
  // Köpt färg kan användas gratis på en annan karaktär
  save.character = 'classic';
  showCustomize();
  const bank1 = save.bank;
  swatch('jacket-red').click();
  t.eq(save.bank, bank1, 'samma färg kostade igen');
  t.eq(skier.mats.jacket.color.getHexString(), 'c62828', 'klassiska åkarens jacka blev inte röd');
  // Förhandsvisning: peka på en wrap man inte äger – syns på skidorna men köps inte
  save.bank = 0;
  showCustomize();
  swatch('wrap-ducks').dispatchEvent(new Event('mouseenter'));
  t.ok(skier.mats.gear.map === wrapTexture('wrap-ducks'), 'ankorna syns inte i förhandsvisningen');
  swatch('wrap-ducks').dispatchEvent(new Event('mouseleave'));
  t.ok(!skier.mats.gear.map, 'förhandsvisningen släppte inte');
  t.ok(!save.owned.includes('wrap-ducks'), 'wrapen köptes av förhandsvisningen');
  save.bank = 5000;
  swatch('wrap-ducks').click();
  t.ok(save.style.wrap === 'wrap-ducks' && skier.mats.gear.map === wrapTexture('wrap-ducks'), 'ankorna valdes inte');
  // Wraps på jacka och byxor (redan köpta ankor kostar inget)
  const bank3 = save.bank;
  swatch('jacketWrap:wrap-ducks').click();
  t.ok(skier.mats.jacket.map === clothTexture('wrap-ducks'), 'ankorna syns inte på jackan');
  t.eq(save.bank, bank3, 'köpt wrap kostade igen på jackan');
  save.bank = 9000;
  swatch('pantsWrap:wrap-flames').click();
  t.ok(skier.mats.pants.map === clothTexture('wrap-flames'), 'flammorna syns inte på byxorna');
  swatch('jacketWrap-orig').click();
  t.ok(!skier.mats.jacket.map, 'jackans wrap gick inte att ta bort');
  // Hjälmens färg
  swatch('helmet-red').click();
  t.eq(skier.mats.helmet.color.getHexString(), 'c62828', 'hjälmen blev inte röd');
  showMenu();
});
function t2(k) { return window.t(k); }
