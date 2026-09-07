/**
 * Minimal WebRTC data-channel peer, the groundwork for multiplayer.
 *
 * GitHub Pages only serves static files, so there is no signaling server.
 * The offer/answer strings produced here are meant to be exchanged out of band
 * (copy/paste, QR code, chat message) or through any relay added later.
 * ICE candidates are gathered up front ("non-trickle") so one string per side
 * is enough to connect.
 *
 * Connectivity uses free public STUN servers. Peers behind strict/symmetric NATs
 * would additionally need a TURN server, which no free public service guarantees.
 *
 * Usage:
 *   const host = new Peer();
 *   const offer = await host.createOffer();        // give this to the guest
 *   const guest = new Peer();
 *   const answer = await guest.acceptOffer(offer); // give this back to the host
 *   await host.acceptAnswer(answer);
 *   host.addEventListener('open', () => host.send({ type: 'hello' }));
 *   guest.addEventListener('message', (e) => console.log(e.detail.data));
 */
export const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export class Peer extends EventTarget {
  /**
   * @param {object} [options]
   * @param {RTCIceServer[]} [options.iceServers]
   * @param {number} [options.gatherTimeoutMs] Stop waiting for ICE candidates after this long.
   */
  constructor({ iceServers = DEFAULT_ICE_SERVERS, gatherTimeoutMs = 4000 } = {}) {
    super();
    this.pc = new RTCPeerConnection({ iceServers });
    this.channel = null;
    this._gatherTimeoutMs = gatherTimeoutMs;

    this.pc.addEventListener('connectionstatechange', () => {
      const state = this.pc.connectionState;
      this._emit('statechange', { state });
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        this._emit('close', { state });
      }
    });
    // The guest receives the channel the host created.
    this.pc.addEventListener('datachannel', (e) => this._attach(e.channel));
  }

  /** Host side: returns an offer string to hand to the guest. */
  async createOffer() {
    this._attach(this.pc.createDataChannel('game', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this._waitForIce();
    return encodeDescription(this.pc.localDescription);
  }

  /** Guest side: consumes the host's offer and returns the answer string to send back. */
  async acceptOffer(offer) {
    await this.pc.setRemoteDescription(decodeDescription(offer));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this._waitForIce();
    return encodeDescription(this.pc.localDescription);
  }

  /** Host side: consumes the guest's answer. The channel opens shortly after. */
  async acceptAnswer(answer) {
    await this.pc.setRemoteDescription(decodeDescription(answer));
  }

  get isOpen() {
    return this.channel?.readyState === 'open';
  }

  /** Sends any JSON-serialisable value. */
  send(message) {
    if (!this.isOpen) throw new Error('Peer channel is not open');
    this.channel.send(JSON.stringify(message));
  }

  close() {
    this.channel?.close();
    this.pc.close();
  }

  _attach(channel) {
    this.channel = channel;
    channel.addEventListener('open', () => this._emit('open'));
    channel.addEventListener('close', () => this._emit('close', { state: 'channel-closed' }));
    channel.addEventListener('error', (e) => this._emit('error', { error: e.error }));
    channel.addEventListener('message', (e) => {
      let data = e.data;
      try { data = JSON.parse(e.data); } catch { /* leave as raw string */ }
      this._emit('message', { data });
    });
  }

  _waitForIce() {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => { if (this.pc.iceGatheringState === 'complete') finish(); };
      const timer = setTimeout(finish, this._gatherTimeoutMs);
      this.pc.addEventListener('icegatheringstatechange', check);
    });
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

// Descriptions are base64 JSON so they survive copy/paste as a single token.
function encodeDescription(desc) {
  const bytes = new TextEncoder().encode(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeDescription(str) {
  const binary = atob(String(str).trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
