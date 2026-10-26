'use strict';
// Musik- och ljudinställningar.

// ---------- Ljud ----------

Sound.setMusic(save.audio.music);
Sound.setSong(save.audio.song || 0);
Sound.setSfx(save.audio.sfx);
// Webbläsaren tillåter ljud först efter att användaren tryckt på något
window.addEventListener('keydown', Sound.init);
window.addEventListener('pointerdown', Sound.init);

function setAudio(kind, on) {
  save.audio[kind] = on;
  persist();
  if (kind === 'music') Sound.setMusic(on);
  else Sound.setSfx(on);
  updateAudioButtons();
}

function updateAudioButtons() {
  const onOff = (on) => t(on ? 'audio.on' : 'audio.off');
  $('btn-music').textContent = `🎵 ${t('audio.music')}: ${onOff(save.audio.music)}`;
  $('btn-sfx').textContent = `🔊 ${t('audio.sfx')}: ${onOff(save.audio.sfx)}`;
}
