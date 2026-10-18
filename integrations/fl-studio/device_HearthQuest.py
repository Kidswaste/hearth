# name=Hearth Quest Guide
# Read-only progress observations. No MIDI event is consumed or sent.
# Installed by Hearth into your chosen FL Studio user-data Hardware folder.
import json
import os
import time
import channels
import mixer
import transport

_last = 0
_config = {}
_last_config = 0

def _configuration(now):
    global _config, _last_config
    if now - _last_config > 2:
        _last_config = now
        try:
            with open(os.path.join(os.path.dirname(__file__), 'hearth-config.json'), 'r', encoding='utf-8') as stream:
                _config = json.load(stream)
        except Exception:
            _config = {}
    return _config

def OnIdle():
    global _last
    now = time.time()
    if now - _last < 0.8:
        return
    _last = now
    config = _configuration(now)
    # Active sessions renew this lease. A closed/crashed Hearth stops observations.
    if not config.get('active') or now * 1000 > config.get('expiresAt', 0):
        return
    try:
        observed = []
        for i in range(min(channels.channelCount(), 128)):
            name = channels.getChannelName(i)
            if any(word in name.lower() for word in ('bass', 'sub', 'reese', '808')):
                # Grid bits also report notes in the current pattern's channel grid.
                # Unsupported versions stay honest: no notes means no auto-check.
                notes = sum(1 for step in range(64) if channels.getGridBit(i, step))
                observed.append({'name': name[:100], 'notes': notes, 'activity': float(channels.getActivityLevel(i))})
        payload = {'version': 1, 'at': int(now * 1000), 'nonce': config.get('nonce'), 'bpm': float(mixer.getCurrentTempo()), 'playing': bool(transport.isPlaying()), 'channels': observed}
        target = config.get('telemetryFile')
        if not target:
            return
        with open(target + '.tmp', 'w', encoding='utf-8') as stream:
            json.dump(payload, stream)
        os.replace(target + '.tmp', target)
    except Exception:
        # Never interrupt music or fill FL Studio's console while Hearth is closed.
        pass
