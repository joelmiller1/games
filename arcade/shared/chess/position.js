// Chess position: 0x88 board, pseudo-legal move generation with legality filtering,
// make/unmake with Zobrist hashing and incrementally-updated tapered evaluation.
//
// Squares are 0x88 indexes with a1 = 0x00, h1 = 0x07, a8 = 0x70, h8 = 0x77.
// Pieces: colour (WHITE = 0, BLACK = 8) | type (PAWN = 1 ... KING = 6). Empty = 0.
// Moves are packed integers: from | to << 7 | promo << 14 | flags.
import { seeded } from '../lib/rng.js';

export const WHITE = 0;
export const BLACK = 8;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const F_CAPTURE = 1 << 17;
export const F_DOUBLE = 1 << 18;
export const F_EP = 1 << 19;
export const F_CASTLE = 1 << 20;

export const moveFrom = (m) => m & 0x7f;
export const moveTo = (m) => (m >> 7) & 0x7f;
export const movePromo = (m) => (m >> 14) & 7;
const mk = (from, to, flags = 0, promo = 0) => from | (to << 7) | (promo << 14) | flags;

export const sqName = (sq) => 'abcdefgh'[sq & 7] + (1 + (sq >> 4));
export function parseSq(s) {
  if (typeof s !== 'string' || s.length !== 2) return -1;
  const f = s.charCodeAt(0) - 97;
  const r = s.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return (r << 4) | f;
}

const PIECE_CHARS = '.PNBRQK..pnbrqk';
export const pieceChar = (p) => PIECE_CHARS[p];
const PROMO_CHARS = ' pnbrqk';

const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_OFFSETS = [17, 15, -17, -15];
const ROOK_OFFSETS = [16, 1, -16, -1];
const KING_OFFSETS = [17, 16, 15, 1, -1, -15, -16, -17];

// Castling rights: 1 = K, 2 = Q, 4 = k, 8 = q
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x04] = 15 & ~3;
CASTLE_MASK[0x07] = 15 & ~1;
CASTLE_MASK[0x00] = 15 & ~2;
CASTLE_MASK[0x74] = 15 & ~12;
CASTLE_MASK[0x77] = 15 & ~4;
CASTLE_MASK[0x70] = 15 & ~8;

// ---------------------------------------------------------------------------
// Zobrist keys (deterministic so every process hashes positions identically)

const zr = seeded(0x1badb002);
const rand32 = () => (zr() * 4294967296) | 0;
const Z_PIECE_LO = new Int32Array(16 * 128);
const Z_PIECE_HI = new Int32Array(16 * 128);
for (let i = 0; i < Z_PIECE_LO.length; i++) {
  Z_PIECE_LO[i] = rand32();
  Z_PIECE_HI[i] = rand32();
}
const Z_SIDE_LO = rand32();
const Z_SIDE_HI = rand32();
const Z_CASTLE_LO = Int32Array.from({ length: 16 }, rand32);
const Z_CASTLE_HI = Int32Array.from({ length: 16 }, rand32);
const Z_EP_LO = Int32Array.from({ length: 8 }, rand32);
const Z_EP_HI = Int32Array.from({ length: 8 }, rand32);

// ---------------------------------------------------------------------------
// Evaluation tables (centipawns). Written from White's point of view, rank 8 first.

export const VALUE_MG = [0, 100, 320, 330, 500, 950, 0];
export const VALUE_EG = [0, 120, 300, 320, 520, 950, 0];
export const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// prettier-ignore
const PST = {
  mg: {
    [PAWN]: [
        0,   0,   0,   0,   0,   0,   0,   0,
       60,  60,  60,  60,  60,  60,  60,  60,
       15,  15,  25,  35,  35,  25,  15,  15,
        5,   5,  10,  25,  25,  10,   5,   5,
        0,   0,   5,  20,  20,   0,   0,   0,
        5,  -5,  -5,   5,   5, -10,  -5,   5,
        5,  10,  10, -20, -20,  10,  10,   5,
        0,   0,   0,   0,   0,   0,   0,   0],
    [KNIGHT]: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20,   0,   5,   5,   0, -20, -40,
      -30,   5,  10,  15,  15,  10,   5, -30,
      -30,   0,  15,  20,  20,  15,   0, -30,
      -30,   5,  15,  20,  20,  15,   5, -30,
      -30,   0,  10,  15,  15,  10,   0, -30,
      -40, -20,   0,   0,   0,   0, -20, -40,
      -50, -35, -30, -30, -30, -30, -35, -50],
    [BISHOP]: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10,   0,   0,   0,   0,   0,   0, -10,
      -10,   0,   5,  10,  10,   5,   0, -10,
      -10,   5,   5,  10,  10,   5,   5, -10,
      -10,   0,  10,  10,  10,  10,   0, -10,
      -10,  10,  10,  10,  10,  10,  10, -10,
      -10,   5,   0,   0,   0,   0,   5, -10,
      -20, -10, -15, -10, -10, -15, -10, -20],
    [ROOK]: [
        0,   0,   0,   0,   0,   0,   0,   0,
       10,  15,  15,  15,  15,  15,  15,  10,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
        0,   0,   3,   8,   8,   5,   0,   0],
    [QUEEN]: [
      -20, -10, -10,  -5,  -5, -10, -10, -20,
      -10,   0,   0,   0,   0,   0,   0, -10,
      -10,   0,   5,   5,   5,   5,   0, -10,
       -5,   0,   5,   5,   5,   5,   0,  -5,
       -5,   0,   5,   5,   5,   5,   0,  -5,
      -10,   5,   5,   5,   5,   5,   0, -10,
      -10,   0,   5,   0,   0,   0,   0, -10,
      -20, -10, -10,  -5,  -5, -10, -10, -20],
    [KING]: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
       15,  15,   0, -10, -10,   0,  15,  15,
       20,  30,  10,   0,   0,  10,  30,  20],
  },
  eg: {
    [PAWN]: [
        0,   0,   0,   0,   0,   0,   0,   0,
       90,  90,  90,  90,  90,  90,  90,  90,
       60,  60,  55,  50,  50,  55,  60,  60,
       35,  35,  30,  25,  25,  30,  35,  35,
       20,  20,  15,  10,  10,  15,  20,  20,
       10,  10,   5,   5,   5,   5,  10,  10,
        5,   5,   5,   5,   5,   5,   5,   5,
        0,   0,   0,   0,   0,   0,   0,   0],
    [KNIGHT]: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20,   0,   0,   0,   0, -20, -40,
      -30,   0,  10,  15,  15,  10,   0, -30,
      -30,   5,  15,  20,  20,  15,   5, -30,
      -30,   0,  15,  20,  20,  15,   0, -30,
      -30,   5,  10,  15,  15,  10,   5, -30,
      -40, -20,   0,   5,   5,   0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50],
    [BISHOP]: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10,   0,   0,   0,   0,   0,   0, -10,
      -10,   0,   5,  10,  10,   5,   0, -10,
      -10,   5,   5,  10,  10,   5,   5, -10,
      -10,   0,  10,  10,  10,  10,   0, -10,
      -10,  10,  10,  10,  10,  10,  10, -10,
      -10,   5,   0,   0,   0,   0,   5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20],
    [ROOK]: [
        5,   5,   5,   5,   5,   5,   5,   5,
       15,  15,  15,  15,  15,  15,  15,  15,
        0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0],
    [QUEEN]: [
      -20, -10, -10,  -5,  -5, -10, -10, -20,
      -10,   0,   5,   5,   5,   5,   0, -10,
      -10,   5,  10,  10,  10,  10,   5, -10,
       -5,   5,  10,  15,  15,  10,   5,  -5,
       -5,   5,  10,  15,  15,  10,   5,  -5,
      -10,   5,  10,  10,  10,  10,   5, -10,
      -10,   0,   5,   5,   5,   5,   0, -10,
      -20, -10, -10,  -5,  -5, -10, -10, -20],
    [KING]: [
      -50, -30, -30, -30, -30, -30, -30, -50,
      -30, -15,   0,   0,   0,   0, -15, -30,
      -30,   0,  20,  30,  30,  20,   0, -30,
      -30,   0,  30,  40,  40,  30,   0, -30,
      -30,   0,  30,  40,  40,  30,   0, -30,
      -30,   0,  20,  30,  30,  20,   0, -30,
      -30, -20,   0,   0,   0,   0, -20, -30,
      -50, -40, -30, -30, -30, -30, -40, -50],
  },
};

// Flattened lookup: [piece * 128 + sq] -> value including material.
const MG_TABLE = new Int16Array(16 * 128);
const EG_TABLE = new Int16Array(16 * 128);
for (const color of [WHITE, BLACK]) {
  for (let type = PAWN; type <= KING; type++) {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const r = sq >> 4;
      const f = sq & 7;
      const idx = color === WHITE ? (7 - r) * 8 + f : r * 8 + f;
      MG_TABLE[(color | type) * 128 + sq] = VALUE_MG[type] + PST.mg[type][idx];
      EG_TABLE[(color | type) * 128 + sq] = VALUE_EG[type] + PST.eg[type][idx];
    }
  }
}

export const MAX_HISTORY = 4096;

export class Position {
  constructor(fen = START_FEN) {
    this.board = new Int8Array(128);
    this.side = WHITE;
    this.castling = 0;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.kings = new Int16Array(2);
    this.hashLo = 0;
    this.hashHi = 0;
    this.mg = new Int32Array(2);
    this.eg = new Int32Array(2);
    this.phase = 0;
    this.counts = new Int8Array(16); // piece counts by piece code
    this.ply = 0;
    this.sMove = new Int32Array(MAX_HISTORY);
    this.sCaptured = new Int8Array(MAX_HISTORY);
    this.sCastling = new Int8Array(MAX_HISTORY);
    this.sEp = new Int16Array(MAX_HISTORY);
    this.sHalf = new Int16Array(MAX_HISTORY);
    this.sHashLo = new Int32Array(MAX_HISTORY);
    this.sHashHi = new Int32Array(MAX_HISTORY);
    this.load(fen);
  }

  // ---- piece bookkeeping (hash + eval) ----
  addPiece(sq, p) {
    this.board[sq] = p;
    const c = p >> 3;
    this.mg[c] += MG_TABLE[p * 128 + sq];
    this.eg[c] += EG_TABLE[p * 128 + sq];
    this.phase += PHASE_W[p & 7];
    this.counts[p]++;
    this.hashLo ^= Z_PIECE_LO[p * 128 + sq];
    this.hashHi ^= Z_PIECE_HI[p * 128 + sq];
  }

  removePiece(sq) {
    const p = this.board[sq];
    this.board[sq] = 0;
    const c = p >> 3;
    this.mg[c] -= MG_TABLE[p * 128 + sq];
    this.eg[c] -= EG_TABLE[p * 128 + sq];
    this.phase -= PHASE_W[p & 7];
    this.counts[p]--;
    this.hashLo ^= Z_PIECE_LO[p * 128 + sq];
    this.hashHi ^= Z_PIECE_HI[p * 128 + sq];
    return p;
  }

  movePiece(from, to) {
    const p = this.removePiece(from);
    this.addPiece(to, p);
  }

  // ---- FEN ----
  load(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Invalid FEN');
    this.board.fill(0);
    this.mg.fill(0);
    this.eg.fill(0);
    this.counts.fill(0);
    this.phase = 0;
    this.hashLo = 0;
    this.hashHi = 0;
    this.ply = 0;
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Invalid FEN board');
    const kings = [0, 0];
    for (let i = 0; i < 8; i++) {
      const rank = 7 - i;
      let file = 0;
      for (const ch of rows[i]) {
        if (ch >= '1' && ch <= '8') {
          file += ch.charCodeAt(0) - 48;
          continue;
        }
        const idx = PIECE_CHARS.indexOf(ch);
        if (idx <= 0 || ch === '.' || file > 7) throw new Error('Invalid FEN piece');
        const sq = (rank << 4) | file;
        if ((idx & 7) === PAWN && (rank === 0 || rank === 7)) throw new Error('Invalid FEN: pawn on back rank');
        this.addPiece(sq, idx);
        if ((idx & 7) === KING) {
          this.kings[idx >> 3] = sq;
          kings[idx >> 3]++;
        }
        file++;
      }
      if (file !== 8) throw new Error('Invalid FEN rank');
    }
    if (kings[0] !== 1 || kings[1] !== 1) throw new Error('FEN must have one king per side');
    this.side = parts[1] === 'b' ? BLACK : WHITE;
    if (this.side === BLACK) {
      this.hashLo ^= Z_SIDE_LO;
      this.hashHi ^= Z_SIDE_HI;
    }
    let c = 0;
    if (parts[2].includes('K') && this.board[0x04] === (WHITE | KING) && this.board[0x07] === (WHITE | ROOK)) c |= 1;
    if (parts[2].includes('Q') && this.board[0x04] === (WHITE | KING) && this.board[0x00] === (WHITE | ROOK)) c |= 2;
    if (parts[2].includes('k') && this.board[0x74] === (BLACK | KING) && this.board[0x77] === (BLACK | ROOK)) c |= 4;
    if (parts[2].includes('q') && this.board[0x74] === (BLACK | KING) && this.board[0x70] === (BLACK | ROOK)) c |= 8;
    this.castling = c;
    this.hashLo ^= Z_CASTLE_LO[c];
    this.hashHi ^= Z_CASTLE_HI[c];
    this.ep = parts[3] === '-' ? -1 : parseSq(parts[3]);
    if (this.ep !== -1) {
      this.hashLo ^= Z_EP_LO[this.ep & 7];
      this.hashHi ^= Z_EP_HI[this.ep & 7];
    }
    this.halfmove = parseInt(parts[4] || '0', 10) || 0;
    this.fullmove = parseInt(parts[5] || '1', 10) || 1;
  }

  fen() {
    let s = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.board[(rank << 4) | file];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          s += empty;
          empty = 0;
        }
        s += PIECE_CHARS[p];
      }
      if (empty) s += empty;
      if (rank) s += '/';
    }
    let c = '';
    if (this.castling & 1) c += 'K';
    if (this.castling & 2) c += 'Q';
    if (this.castling & 4) c += 'k';
    if (this.castling & 8) c += 'q';
    return `${s} ${this.side === WHITE ? 'w' : 'b'} ${c || '-'} ${this.ep === -1 ? '-' : sqName(this.ep)} ${this.halfmove} ${this.fullmove}`;
  }

  /** Repetition key: placement, side, castling and en passant only when a capture is possible. */
  positionKey() {
    const f = this.fen().split(' ');
    let ep = '-';
    if (this.ep !== -1) {
      const us = this.side;
      const dir = us === WHITE ? -16 : 16;
      for (const d of [-1, 1]) {
        const s = this.ep + dir + d;
        if (!(s & 0x88) && this.board[s] === (us | PAWN)) ep = f[3];
      }
    }
    return `${f[0]} ${f[1]} ${f[2]} ${ep}`;
  }

  // ---- attacks ----
  isAttacked(sq, by) {
    const b = this.board;
    let s;
    if (by === WHITE) {
      s = sq - 15;
      if (!(s & 0x88) && b[s] === (WHITE | PAWN)) return true;
      s = sq - 17;
      if (!(s & 0x88) && b[s] === (WHITE | PAWN)) return true;
    } else {
      s = sq + 15;
      if (!(s & 0x88) && b[s] === (BLACK | PAWN)) return true;
      s = sq + 17;
      if (!(s & 0x88) && b[s] === (BLACK | PAWN)) return true;
    }
    const knight = by | KNIGHT;
    for (let i = 0; i < 8; i++) {
      s = sq + KNIGHT_OFFSETS[i];
      if (!(s & 0x88) && b[s] === knight) return true;
    }
    const king = by | KING;
    for (let i = 0; i < 8; i++) {
      s = sq + KING_OFFSETS[i];
      if (!(s & 0x88) && b[s] === king) return true;
    }
    const bishop = by | BISHOP;
    const rook = by | ROOK;
    const queen = by | QUEEN;
    for (let i = 0; i < 4; i++) {
      const o = BISHOP_OFFSETS[i];
      s = sq + o;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) {
          if (p === bishop || p === queen) return true;
          break;
        }
        s += o;
      }
    }
    for (let i = 0; i < 4; i++) {
      const o = ROOK_OFFSETS[i];
      s = sq + o;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) {
          if (p === rook || p === queen) return true;
          break;
        }
        s += o;
      }
    }
    return false;
  }

  inCheck(side = this.side) {
    return this.isAttacked(this.kings[side >> 3], side ^ 8);
  }

  // ---- move generation ----
  /** Writes pseudo-legal moves into `out` starting at `n`; returns the new count. */
  generate(out, n = 0, capturesOnly = false) {
    const b = this.board;
    const us = this.side;
    const them = us ^ 8;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = b[sq];
      if (!p || (p & 8) !== us) continue;
      const type = p & 7;
      if (type === PAWN) {
        const dir = us === WHITE ? 16 : -16;
        const rank = sq >> 4;
        const promoRank = us === WHITE ? 6 : 1;
        const startRank = us === WHITE ? 1 : 6;
        for (let k = -1; k <= 1; k += 2) {
          const t = sq + dir + k;
          if (t & 0x88) continue;
          const tp = b[t];
          if (tp && (tp & 8) === them) {
            if (rank === promoRank) {
              for (let pr = QUEEN; pr >= KNIGHT; pr--) out[n++] = mk(sq, t, F_CAPTURE, pr);
            } else out[n++] = mk(sq, t, F_CAPTURE);
          } else if (t === this.ep) {
            out[n++] = mk(sq, t, F_CAPTURE | F_EP);
          }
        }
        const one = sq + dir;
        if (!b[one]) {
          if (rank === promoRank) {
            out[n++] = mk(sq, one, 0, QUEEN);
            if (!capturesOnly) for (let pr = ROOK; pr >= KNIGHT; pr--) out[n++] = mk(sq, one, 0, pr);
          } else if (!capturesOnly) {
            out[n++] = mk(sq, one);
            if (rank === startRank && !b[one + dir]) out[n++] = mk(sq, one + dir, F_DOUBLE);
          }
        }
      } else if (type === KNIGHT || type === KING) {
        const offs = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (let i = 0; i < 8; i++) {
          const t = sq + offs[i];
          if (t & 0x88) continue;
          const tp = b[t];
          if (!tp) {
            if (!capturesOnly) out[n++] = mk(sq, t);
          } else if ((tp & 8) === them) out[n++] = mk(sq, t, F_CAPTURE);
        }
        if (type === KING && !capturesOnly) n = this.genCastles(out, n);
      } else {
        const offs = type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : KING_OFFSETS;
        for (let i = 0; i < offs.length; i++) {
          const o = offs[i];
          let t = sq + o;
          while (!(t & 0x88)) {
            const tp = b[t];
            if (!tp) {
              if (!capturesOnly) out[n++] = mk(sq, t);
            } else {
              if ((tp & 8) === them) out[n++] = mk(sq, t, F_CAPTURE);
              break;
            }
            t += o;
          }
        }
      }
    }
    return n;
  }

  genCastles(out, n) {
    const b = this.board;
    const us = this.side;
    const them = us ^ 8;
    if (us === WHITE) {
      if (this.castling & 3 && this.kings[0] === 0x04 && !this.isAttacked(0x04, them)) {
        if (this.castling & 1 && !b[0x05] && !b[0x06] && !this.isAttacked(0x05, them)) out[n++] = mk(0x04, 0x06, F_CASTLE);
        if (this.castling & 2 && !b[0x03] && !b[0x02] && !b[0x01] && !this.isAttacked(0x03, them)) out[n++] = mk(0x04, 0x02, F_CASTLE);
      }
    } else if (this.castling & 12 && this.kings[1] === 0x74 && !this.isAttacked(0x74, them)) {
      if (this.castling & 4 && !b[0x75] && !b[0x76] && !this.isAttacked(0x75, them)) out[n++] = mk(0x74, 0x76, F_CASTLE);
      if (this.castling & 8 && !b[0x73] && !b[0x72] && !b[0x71] && !this.isAttacked(0x73, them)) out[n++] = mk(0x74, 0x72, F_CASTLE);
    }
    return n;
  }

  // ---- make / unmake ----
  /** Makes a pseudo-legal move. Returns false (and undoes it) if it leaves our king in check. */
  make(m) {
    const b = this.board;
    const from = m & 0x7f;
    const to = (m >> 7) & 0x7f;
    const promo = (m >> 14) & 7;
    const us = this.side;
    const piece = b[from];
    const i = this.ply++;
    this.sMove[i] = m;
    this.sCastling[i] = this.castling;
    this.sEp[i] = this.ep;
    this.sHalf[i] = this.halfmove;
    this.sHashLo[i] = this.hashLo;
    this.sHashHi[i] = this.hashHi;

    if (this.ep !== -1) {
      this.hashLo ^= Z_EP_LO[this.ep & 7];
      this.hashHi ^= Z_EP_HI[this.ep & 7];
    }
    this.hashLo ^= Z_CASTLE_LO[this.castling];
    this.hashHi ^= Z_CASTLE_HI[this.castling];

    let captured = 0;
    if (m & F_EP) {
      const capSq = to + (us === WHITE ? -16 : 16);
      captured = this.removePiece(capSq);
    } else if (b[to]) {
      captured = this.removePiece(to);
    }
    this.sCaptured[i] = captured;
    this.halfmove = captured || (piece & 7) === PAWN ? 0 : this.halfmove + 1;

    this.movePiece(from, to);
    if (promo) {
      this.removePiece(to);
      this.addPiece(to, us | promo);
    }
    if (m & F_CASTLE) {
      if (to > from) this.movePiece(from + 3, from + 1);
      else this.movePiece(from - 4, from - 1);
    }
    if ((piece & 7) === KING) this.kings[us >> 3] = to;

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = m & F_DOUBLE ? (from + to) >> 1 : -1;
    if (this.ep !== -1) {
      this.hashLo ^= Z_EP_LO[this.ep & 7];
      this.hashHi ^= Z_EP_HI[this.ep & 7];
    }
    this.hashLo ^= Z_CASTLE_LO[this.castling];
    this.hashHi ^= Z_CASTLE_HI[this.castling];
    if (us === BLACK) this.fullmove++;
    this.side = us ^ 8;
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;

    if (this.isAttacked(this.kings[us >> 3], this.side)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake() {
    const m = this.sMove[this.ply - 1];
    if (m === 0) return this.unmakeNull();
    const i = --this.ply;
    const from = m & 0x7f;
    const to = (m >> 7) & 0x7f;
    const promo = (m >> 14) & 7;
    this.side ^= 8;
    const us = this.side;
    if (us === BLACK) this.fullmove--;
    if (promo) {
      this.removePiece(to);
      this.addPiece(to, us | PAWN);
    }
    this.movePiece(to, from);
    if (m & F_CASTLE) {
      if (to > from) this.movePiece(from + 1, from + 3);
      else this.movePiece(from - 1, from - 4);
    }
    const captured = this.sCaptured[i];
    if (captured) {
      if (m & F_EP) this.addPiece(to + (us === WHITE ? -16 : 16), captured);
      else this.addPiece(to, captured);
    }
    if ((this.board[from] & 7) === KING) this.kings[us >> 3] = from;
    this.castling = this.sCastling[i];
    this.ep = this.sEp[i];
    this.halfmove = this.sHalf[i];
    this.hashLo = this.sHashLo[i];
    this.hashHi = this.sHashHi[i];
  }

  makeNull() {
    const i = this.ply++;
    this.sMove[i] = 0;
    this.sCaptured[i] = 0;
    this.sCastling[i] = this.castling;
    this.sEp[i] = this.ep;
    this.sHalf[i] = this.halfmove;
    this.sHashLo[i] = this.hashLo;
    this.sHashHi[i] = this.hashHi;
    if (this.ep !== -1) {
      this.hashLo ^= Z_EP_LO[this.ep & 7];
      this.hashHi ^= Z_EP_HI[this.ep & 7];
      this.ep = -1;
    }
    this.halfmove++;
    this.side ^= 8;
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;
  }

  unmakeNull() {
    const i = --this.ply;
    this.side ^= 8;
    this.ep = this.sEp[i];
    this.halfmove = this.sHalf[i];
    this.hashLo = this.sHashLo[i];
    this.hashHi = this.sHashHi[i];
  }

  // ---- queries ----
  legalMoves() {
    const buf = new Int32Array(256);
    const n = this.generate(buf, 0, false);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (this.make(buf[i])) {
        this.unmake();
        out.push(buf[i]);
      }
    }
    return out;
  }

  /** True if the current position occurred before (same side to move) since the last irreversible move. */
  isRepetition(times = 1) {
    let seen = 0;
    const stop = Math.max(0, this.ply - this.halfmove);
    for (let i = this.ply - 2; i >= stop; i -= 2) {
      if (this.sHashLo[i] === this.hashLo && this.sHashHi[i] === this.hashHi) {
        if (++seen >= times) return true;
      }
    }
    return false;
  }

  insufficientMaterial() {
    const c = this.counts;
    if (c[WHITE | PAWN] || c[BLACK | PAWN] || c[WHITE | ROOK] || c[BLACK | ROOK] || c[WHITE | QUEEN] || c[BLACK | QUEEN]) return false;
    const wMinor = c[WHITE | KNIGHT] + c[WHITE | BISHOP];
    const bMinor = c[BLACK | KNIGHT] + c[BLACK | BISHOP];
    if (wMinor + bMinor <= 1) return true; // K v K, K+minor v K
    // K+B v K+B with bishops on the same colour
    if (wMinor === 1 && bMinor === 1 && c[WHITE | BISHOP] === 1 && c[BLACK | BISHOP] === 1) {
      let colors = [];
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        if ((this.board[sq] & 7) === BISHOP) colors.push(((sq >> 4) + (sq & 7)) & 1);
      }
      return colors[0] === colors[1];
    }
    return false;
  }

  /** Can `side` still possibly deliver mate? Used when the opponent's flag falls. */
  hasMatingMaterial(side) {
    const c = this.counts;
    if (c[side | PAWN] || c[side | ROOK] || c[side | QUEEN]) return true;
    const minors = c[side | KNIGHT] + c[side | BISHOP];
    return minors >= 2;
  }

  moveToUci(m) {
    const promo = movePromo(m);
    return sqName(moveFrom(m)) + sqName(moveTo(m)) + (promo ? PROMO_CHARS[promo] : '');
  }

  findMove(from, to, promoChar) {
    const promo = promoChar ? PROMO_CHARS.indexOf(String(promoChar).toLowerCase()) : 0;
    for (const m of this.legalMoves()) {
      if (moveFrom(m) !== from || moveTo(m) !== to) continue;
      const mp = movePromo(m);
      if (mp === 0 || mp === (promo || QUEEN)) return m;
    }
    return 0;
  }

  parseUci(uci) {
    return this.findMove(parseSq(uci.slice(0, 2)), parseSq(uci.slice(2, 4)), uci[4]);
  }

  /** Standard algebraic notation for a legal move in this position. */
  san(m) {
    const from = moveFrom(m);
    const to = moveTo(m);
    const p = this.board[from];
    const type = p & 7;
    let s;
    if (m & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
    else if (type === PAWN) {
      s = m & F_CAPTURE ? 'abcdefgh'[from & 7] + 'x' + sqName(to) : sqName(to);
      const promo = movePromo(m);
      if (promo) s += '=' + 'PNBRQK'[promo - 1];
    } else {
      s = 'PNBRQK'[type - 1];
      const others = this.legalMoves().filter((o) => o !== m && moveTo(o) === to && this.board[moveFrom(o)] === p);
      if (others.length) {
        const sameFile = others.some((o) => (moveFrom(o) & 7) === (from & 7));
        const sameRank = others.some((o) => moveFrom(o) >> 4 === from >> 4);
        if (!sameFile) s += 'abcdefgh'[from & 7];
        else if (!sameRank) s += String(1 + (from >> 4));
        else s += sqName(from);
      }
      if (m & F_CAPTURE) s += 'x';
      s += sqName(to);
    }
    this.make(m);
    if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
    this.unmake();
    return s;
  }

  // ---- evaluation (from the side to move's perspective) ----
  evaluate() {
    const us = this.side >> 3;
    const them = us ^ 1;
    const phase = Math.min(24, this.phase);
    let mg = this.mg[us] - this.mg[them];
    let eg = this.eg[us] - this.eg[them];
    const c = this.counts;
    const usC = us << 3;
    const themC = them << 3;
    if (c[usC | BISHOP] >= 2) {
      mg += 25;
      eg += 40;
    }
    if (c[themC | BISHOP] >= 2) {
      mg -= 25;
      eg -= 40;
    }
    let score = ((mg * phase + eg * (24 - phase)) / 24) | 0;
    // Mop-up: with a decisive material edge and no pawns for the defender, herd the lone king.
    if (phase <= 8) {
      const matUs = this.eg[us];
      const matThem = this.eg[them];
      const diff = matUs - matThem;
      if (Math.abs(diff) >= 300) {
        const strong = diff > 0 ? us : them;
        const weak = strong ^ 1;
        if (!c[(weak << 3) | PAWN]) {
          const wk = this.kings[weak];
          const sk = this.kings[strong];
          const wf = wk & 7;
          const wr = wk >> 4;
          const centerDist = Math.max(3 - wf, wf - 4) + Math.max(3 - wr, wr - 4);
          const kingDist = Math.abs(wf - (sk & 7)) + Math.abs(wr - (sk >> 4));
          const bonus = 10 * centerDist + 4 * (14 - kingDist);
          score += strong === us ? bonus : -bonus;
        }
      }
    }
    return score + 10; // small tempo bonus
  }
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  const buf = new Int32Array(256);
  const n = pos.generate(buf, 0, false);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!pos.make(buf[i])) continue;
    total += depth === 1 ? 1 : perft(pos, depth - 1);
    pos.unmake();
  }
  return total;
}
