import * as PIXI from "pixi.js";
import { gsap } from "gsap";

export const GEM_COLORS = [
  { fill: 0xe74c3c, glow: 0xff6b6b, name: "Ruby" },
  { fill: 0x3498db, glow: 0x74b9ff, name: "Sapphire" },
  { fill: 0x2ecc71, glow: 0x55efc4, name: "Emerald" },
  { fill: 0xf39c12, glow: 0xfdcb6e, name: "Topaz" },
  { fill: 0x9b59b6, glow: 0xa29bfe, name: "Amethyst" },
  { fill: 0x1abc9c, glow: 0x00cec9, name: "Aquamarine" },
];

export const GRID_SIZE = 8;

export interface GemCell {
  type: number;
  sprite: PIXI.Container;
  row: number;
  col: number;
}

export interface MatchGroup {
  row: number;
  col: number;
  gemType: number;
}

/** Compute the largest cell size that fits the grid inside the given canvas size */
function calcCellSize(canvasW: number, canvasH: number): number {
  const padding = 16; // total padding on each axis
  const maxByW = Math.floor((canvasW - padding) / GRID_SIZE);
  const maxByH = Math.floor((canvasH - padding) / GRID_SIZE);
  return Math.max(Math.min(maxByW, maxByH), 20); // at least 20px
}

function drawGem(type: number, gemSize: number): PIXI.Container {
  const container = new PIXI.Container();
  const color = GEM_COLORS[type % GEM_COLORS.length]!;
  const g = new PIXI.Graphics();
  const half = gemSize / 2;
  const r = gemSize * 0.15;

  g.roundRect(-half + 2, -half + 4, gemSize, gemSize, r);
  g.fill({ color: 0x000000, alpha: 0.3 });

  g.roundRect(-half, -half, gemSize, gemSize, r);
  g.fill({ color: color.fill });

  g.roundRect(-half + 4, -half + 4, gemSize * 0.55, gemSize * 0.45, r * 0.6);
  g.fill({ color: 0xffffff, alpha: 0.25 });

  g.roundRect(-half + 6, half - gemSize * 0.12, gemSize - 12, gemSize * 0.1, 4);
  g.fill({ color: 0xffffff, alpha: 0.1 });

  g.roundRect(-half, -half, gemSize, gemSize, r);
  g.stroke({ color: color.glow, width: 1.5, alpha: 0.7 });

  container.addChild(g);

  const label = new PIXI.Text({
    text: ["♦", "●", "▲", "★", "♠", "◆"][type % 6]!,
    style: {
      fontSize: gemSize * 0.32,
      fill: 0xffffff,
      fontWeight: "bold",
      dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.5 },
    },
  });
  label.anchor.set(0.5);
  container.addChild(label);

  return container;
}

export class GemBlitzEngine {
  app: PIXI.Application;
  grid: GemCell[][] = [];
  gridContainer: PIXI.Container;
  particleContainer: PIXI.Container;
  private bgLayer: PIXI.Graphics;
  private gridBg: PIXI.Graphics;
  private _width: number;
  private _height: number;
  private _cellSize: number;
  private _gemSize: number;
  private isAnimating = false;
  private _initialized = false;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this._width = width;
    this._height = height;
    this._cellSize = calcCellSize(width, height);
    this._gemSize = Math.floor(this._cellSize * 0.93);

    this.app = new PIXI.Application();
    this.gridContainer = new PIXI.Container();
    this.particleContainer = new PIXI.Container();
    this.bgLayer = new PIXI.Graphics();
    this.gridBg = new PIXI.Graphics();
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number) {
    this._width = width;
    this._height = height;
    this._cellSize = calcCellSize(width, height);
    this._gemSize = Math.floor(this._cellSize * 0.93);

    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x0d0d1a,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });

    this.app.stage.addChild(this.bgLayer);
    this.app.stage.addChild(this.gridBg);
    this.app.stage.addChild(this.gridContainer);
    this.app.stage.addChild(this.particleContainer);

    this._drawBackground();
    this.buildGrid();
    this._initialized = true;
  }

  private _drawBackground() {
    const { _width: w, _height: h, _cellSize: cs, _gemSize: gs } = this;
    const totalSize = GRID_SIZE * cs;
    const offsetX = (w - totalSize) / 2;
    const offsetY = (h - totalSize) / 2;

    this.bgLayer.clear();
    this.bgLayer.rect(0, 0, w, h);
    this.bgLayer.fill({ color: 0x0d0d1a });

    this.gridBg.clear();
    this.gridBg.roundRect(offsetX - 8, offsetY - 8, totalSize + 16, totalSize + 16, 12);
    this.gridBg.fill({ color: 0x1a1a2e });
    this.gridBg.stroke({ color: 0xf5c842, width: 1, alpha: 0.2 });

    this.gridContainer.x = offsetX;
    this.gridContainer.y = offsetY;
  }

  buildGrid() {
    this.gridContainer.removeChildren();
    this.grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      this.grid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const type = Math.floor(Math.random() * GEM_COLORS.length);
        const cell = this.createGemCell(r, c, type);
        this.grid[r]![c] = cell;
      }
    }
  }

  createGemCell(row: number, col: number, type: number): GemCell {
    const { _cellSize: cs, _gemSize: gs } = this;
    const sprite = drawGem(type, gs);
    sprite.x = col * cs + gs / 2;
    sprite.y = row * cs + gs / 2;
    this.gridContainer.addChild(sprite);
    return { type, sprite, row, col };
  }

  async applyRoundResult(
    serverGrid: number[][],
    matches: Array<{ row: number; col: number; gemType: number }[]>,
    cascades: number,
    isWin: boolean,
    multiplier: number,
    onComplete: () => void
  ) {
    if (this.isAnimating) return;
    this.isAnimating = true;
    await this.shakeGrid();
    await this.transitionToGrid(serverGrid);
    if (isWin && matches.length > 0) {
      await this.animateMatches(matches);
      if (cascades > 0) await this.animateCascades(cascades);
      await this.showWinEffect(multiplier);
    }
    this.isAnimating = false;
    onComplete();
  }

  private shakeGrid(): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this.gridContainer, {
        x: this.gridContainer.x + 4,
        duration: 0.05, yoyo: true, repeat: 3, onComplete: resolve,
      });
    });
  }

  private transitionToGrid(serverGrid: number[][]): Promise<void> {
    const { _cellSize: cs, _gemSize: gs } = this;
    return new Promise((resolve) => {
      let completed = 0;
      const total = GRID_SIZE * GRID_SIZE;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const newType = serverGrid[r]?.[c] ?? 0;
          const cell = this.grid[r]?.[c];
          if (!cell) { completed++; if (completed === total) resolve(); continue; }
          if (cell.type !== newType) {
            gsap.to(cell.sprite.scale, {
              x: 0, y: 0, duration: 0.15, delay: (r + c) * 0.01,
              onComplete: () => {
                this.gridContainer.removeChild(cell.sprite);
                const newSprite = drawGem(newType, gs);
                newSprite.x = c * cs + gs / 2;
                newSprite.y = r * cs + gs / 2;
                newSprite.scale.set(0);
                this.gridContainer.addChild(newSprite);
                cell.sprite = newSprite;
                cell.type = newType;
                gsap.to(newSprite.scale, {
                  x: 1, y: 1, duration: 0.2, ease: "back.out(1.7)",
                  onComplete: () => { completed++; if (completed === total) resolve(); },
                });
              },
            });
          } else {
            completed++;
            if (completed === total) resolve();
          }
        }
      }
    });
  }

  private animateMatches(matches: Array<{ row: number; col: number; gemType: number }[]>): Promise<void> {
    return new Promise((resolve) => {
      const allCells = matches.flat();
      let done = 0;
      if (allCells.length === 0) { resolve(); return; }
      for (const pos of allCells) {
        const cell = this.grid[pos.row]?.[pos.col];
        if (!cell) { done++; if (done === allCells.length) resolve(); continue; }
        gsap.to(cell.sprite.scale, {
          x: 1.25, y: 1.25, duration: 0.2, yoyo: true, repeat: 3, ease: "power2.inOut",
          onComplete: () => {
            this.spawnParticles(
              cell.sprite.x + this.gridContainer.x,
              cell.sprite.y + this.gridContainer.y,
              GEM_COLORS[cell.type % GEM_COLORS.length]!.glow
            );
            done++;
            if (done === allCells.length) resolve();
          },
        });
      }
    });
  }

  private animateCascades(count: number): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        if (i >= count) { resolve(); return; }
        gsap.to(this.gridContainer, {
          y: this.gridContainer.y - 6, duration: 0.1, yoyo: true, repeat: 1,
          onComplete: () => { i++; setTimeout(tick, 100); },
        });
      };
      tick();
    });
  }

  private showWinEffect(multiplier: number): Promise<void> {
    const { _cellSize: cs } = this;
    return new Promise((resolve) => {
      const flash = new PIXI.Graphics();
      const totalSize = GRID_SIZE * cs;
      flash.roundRect(0, 0, totalSize, totalSize, 12);
      flash.fill({ color: 0xf5c842, alpha: 0.3 });
      this.gridContainer.addChild(flash);
      gsap.to(flash, {
        alpha: 0, duration: 0.5,
        onComplete: () => { this.gridContainer.removeChild(flash); resolve(); },
      });
    });
  }

  private spawnParticles(x: number, y: number, color: number) {
    for (let i = 0; i < 8; i++) {
      const p = new PIXI.Graphics();
      p.circle(0, 0, 3 + Math.random() * 3);
      p.fill({ color, alpha: 0.9 });
      p.x = x; p.y = y;
      this.particleContainer.addChild(p);
      const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
      const speed = 40 + Math.random() * 60;
      gsap.to(p, {
        x: x + Math.cos(angle) * speed, y: y + Math.sin(angle) * speed,
        alpha: 0, duration: 0.5 + Math.random() * 0.3, ease: "power2.out",
        onComplete: () => this.particleContainer.removeChild(p),
      });
    }
  }

  startIdleAnimation() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = this.grid[r]?.[c];
        if (!cell) continue;
        gsap.to(cell.sprite.scale, {
          x: 1.03, y: 1.03,
          duration: 1.5 + Math.random() * 0.5,
          yoyo: true, repeat: -1,
          delay: (r * GRID_SIZE + c) * 0.05,
          ease: "sine.inOut",
        });
      }
    }
  }

  /** Resize canvas and rescale all gems to fit the new dimensions */
  resize(width: number, height: number) {
    this._width = width;
    this._height = height;
    this._cellSize = calcCellSize(width, height);
    this._gemSize = Math.floor(this._cellSize * 0.93);

    this.app.renderer.resize(width, height);
    this._drawBackground();

    // Rebuild sprites at new size (preserve current grid types)
    const currentTypes: number[][] = this.grid.map((row) => row.map((cell) => cell.type));
    this.gridContainer.removeChildren();
    this.grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      this.grid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const type = currentTypes[r]?.[c] ?? Math.floor(Math.random() * GEM_COLORS.length);
        const cell = this.createGemCell(r, c, type);
        this.grid[r]![c] = cell;
      }
    }
  }

  destroy() {
    if (!this._initialized) return;
    this._initialized = false;
    try {
      gsap.killTweensOf(this.gridContainer);
      this.app.destroy(false);
    } catch (e) {
      // ignore destroy errors
    }
  }
}
