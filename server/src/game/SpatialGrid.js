import { GAME } from "./constants.js";

export class SpatialGrid {
  constructor(cellSize = GAME.NETWORK.GRID_CELL_SIZE) {
    this.cellSize = cellSize;
    this.cells = new Map(); // key -> Set(entity)
  }

  clear() {
    this.cells.clear();
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  _cellCoord(v) {
    return Math.floor(v / this.cellSize);
  }

  insert(entity) {
    const cx = this._cellCoord(entity.x);
    const cy = this._cellCoord(entity.y);
    const k = this._key(cx, cy);
    let set = this.cells.get(k);
    if (!set) {
      set = new Set();
      this.cells.set(k, set);
    }
    set.add(entity);
  }

  queryCircle(x, y, radius) {
    const r = radius;
    const minCx = this._cellCoord(x - r);
    const maxCx = this._cellCoord(x + r);
    const minCy = this._cellCoord(y - r);
    const maxCy = this._cellCoord(y + r);

    const out = [];
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cy = minCy; cy <= maxCy; cy += 1) {
        const set = this.cells.get(this._key(cx, cy));
        if (!set) continue;
        for (const e of set) out.push(e);
      }
    }
    return out;
  }
}


