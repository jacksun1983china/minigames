import * as PIXI from "pixi.js";
import { gsap } from "gsap";

// ── Gem Types ─────────────────────────────────────────────────────────────────
export const GEM_COLORS = [
  { fill: 0xe74c3c, glow: 0xff6b6b, name: "Ruby" },      // 0 Red
  { fill: 0x3498db, glow: 0x74b9ff, name: "Sapphire" },  // 1 Blue
  { fill: 0x2ecc71, glow: 0x55efc4, name: "Emerald" },   // 2 Green
  { fill: 0xf39c12, glow: 0xfdcb6e, name: "Topaz" },     // 3 Yellow
  { fill: 0x9b59b6, glow: 0xa29bfe, name: "Amethyst" },  // 4 Purple
  { fill: 0x1abc9c, glow: 0x00cec9, name: "Aquamarine" }, // 5 Teal
];

export const GRID_SIZE = 8;
export const GEM_SIZE = 56;
export const GEM_GAP = 4;
export const CELL_SIZE = GEM_SIZE + GEM_GAP;

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

// ── Draw a single gem ─────────────────────────────────────────────────────────
function drawGem(type: number, size: number): PIXI.Container {
  const container = new PIXI.Container();
  const color = GEM_COLORS[type % GEM_COLORS.length]!;
  const g = new PIXI.Graphics();
  const half = size / 2;
  const r = size * 0.15;

  // Shadow
  g.roundRect(-half + 2, -half + 4, size, size, r);
  g.fill({ color: 0x000000, alpha: 0.3 });

  // Gem body
  g.roundRect(-half, -half, size, size, r);
  g.fill({ color: color.fill });

  // Inner highlight gradient (top-left)
  g.roundRect(-half + 4, -half + 4, size * 0.55, size * 0.45, r * 0.6);
  g.fill({ color: 0xffffff, alpha: 0.25 });

  // Bottom shine
  g.roundRect(-half + 6, half - 14, size - 12, 8, 4);
  g.fill({ color: 0xffffff, alpha: 0.1 });

  // Border
  g.roundRect(-half, -half, size, size, r);
  g.stroke({ color: color.glow, width: 1.5, alpha: 0.7 });

  container.addChild(g);

  // Gem type indicator (small icon)
  const label = new PIXI.Text({
    text: ["♦", "●", "▲", "★", "♠", "◆"][type % 6]!,
    style: {
      fontSize: size * 0.32,
      fill: 0xffffff,
      fontWeight: "bold",
      dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.5 },
    },
  });
  label.anchor.set(0.5);
  container.addChild(label);

  return container;
}

// ── Main Game Engine ──────────────────────────────────────────────────────────
export class GemBlitzEngine {
  app: PIXI.Application;
  grid: GemCell[][] = [];
  gridContainer: PIXI.Container;
  particleContainer: PIXI.Container;
  private _width: number;
  private _height: number;
  private isAnimating = false;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this._width = width;
    this._height = height;

    this.app = new PIXI.Application();
    this.gridContainer = new PIXI.Container();
    this.particleContainer = new PIXI.Container();
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number) {
    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x0d0d1a,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });

    // Background gradient
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, width, height);
    bg.fill({ color: 0x0d0d1a });
    this.app.stage.addChild(bg);

    // Subtle grid background
    const gridBg = new PIXI.Graphics();
    const totalSize = GRID_SIZE * CELL_SIZE;
    const offsetX = (width - totalSize) / 2;
    const offsetY = (height - totalSize) / 2;
    gridBg.roundRect(offsetX - 8, offsetY - 8, totalSize + 16, totalSize + 16, 12);
    gridBg.fill({ color: 0x1a1a2e });
    gridBg.stroke({ color: 0xf5c842, width: 1, alpha: 0.2 });
    this.app.stage.addChild(gridBg);

    this.gridContainer.x = offsetX;
    this.gridContainer.y = offsetY;
    this.app.stage.addChild(this.gridContainer);
    this.app.stage.addChild(this.particleContainer);

    this.buildGrid();
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
    const sprite = drawGem(type, GEM_SIZE);
    sprite.x = col * CELL_SIZE + GEM_SIZE / 2;
    sprite.y = row * CELL_SIZE + GEM_SIZE / 2;
    this.gridContainer.addChild(sprite);
    return { type, sprite, row, col };
  }

  /** Apply server-provided grid and animate matches */
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

    // 1. Animate current gems out (shake)
    await this.shakeGrid();

    // 2. Update grid to server result
    await this.transitionToGrid(serverGrid);

    // 3. If win, highlight matches
    if (isWin && matches.length > 0) {
      await this.animateMatches(matches);
      if (cascades > 0) {
        await this.animateCascades(cascades);
      }
      await this.showWinEffect(multiplier);
    }

    this.isAnimating = false;
    onComplete();
  }

  private shakeGrid(): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this.gridContainer, {
        x: this.gridContainer.x + 4,
        duration: 0.05,
        yoyo: true,
        repeat: 3,
        onComplete: resolve,
      });
    });
  }

  private transitionToGrid(serverGrid: number[][]): Promise<void> {
    return new Promise((resolve) => {
      let completed = 0;
      const total = GRID_SIZE * GRID_SIZE;

      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const newType = serverGrid[r]?.[c] ?? 0;
          const cell = this.grid[r]?.[c];
          if (!cell) { completed++; if (completed === total) resolve(); continue; }

          if (cell.type !== newType) {
            // Animate out old gem
            gsap.to(cell.sprite.scale, {
              x: 0, y: 0,
              duration: 0.15,
              delay: (r + c) * 0.01,
              onComplete: () => {
                // Swap gem type
                this.gridContainer.removeChild(cell.sprite);
                const newSprite = drawGem(newType, GEM_SIZE);
                newSprite.x = c * CELL_SIZE + GEM_SIZE / 2;
                newSprite.y = r * CELL_SIZE + GEM_SIZE / 2;
                newSprite.scale.set(0);
                this.gridContainer.addChild(newSprite);
                cell.sprite = newSprite;
                cell.type = newType;

                gsap.to(newSprite.scale, {
                  x: 1, y: 1,
                  duration: 0.2,
                  ease: "back.out(1.7)",
                  onComplete: () => {
                    completed++;
                    if (completed === total) resolve();
                  },
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

        // Glow pulse
        gsap.to(cell.sprite.scale, {
          x: 1.25, y: 1.25,
          duration: 0.2,
          yoyo: true,
          repeat: 3,
          ease: "power2.inOut",
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
          y: this.gridContainer.y - 6,
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          onComplete: () => { i++; setTimeout(tick, 100); },
        });
      };
      tick();
    });
  }

  private showWinEffect(multiplier: number): Promise<void> {
    return new Promise((resolve) => {
      // Flash the whole grid gold
      const flash = new PIXI.Graphics();
      const totalSize = GRID_SIZE * CELL_SIZE;
      flash.roundRect(0, 0, totalSize, totalSize, 12);
      flash.fill({ color: 0xf5c842, alpha: 0.3 });
      this.gridContainer.addChild(flash);

      gsap.to(flash, {
        alpha: 0,
        duration: 0.5,
        onComplete: () => {
          this.gridContainer.removeChild(flash);
          resolve();
        },
      });
    });
  }

  private spawnParticles(x: number, y: number, color: number) {
    for (let i = 0; i < 8; i++) {
      const p = new PIXI.Graphics();
      p.circle(0, 0, 3 + Math.random() * 3);
      p.fill({ color, alpha: 0.9 });
      p.x = x;
      p.y = y;
      this.particleContainer.addChild(p);

      const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
      const speed = 40 + Math.random() * 60;
      gsap.to(p, {
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.3,
        ease: "power2.out",
        onComplete: () => this.particleContainer.removeChild(p),
      });
    }
  }

  /** Idle animation: gentle gem breathing */
  startIdleAnimation() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = this.grid[r]?.[c];
        if (!cell) continue;
        const delay = (r * GRID_SIZE + c) * 0.05;
        gsap.to(cell.sprite.scale, {
          x: 1.03, y: 1.03,
          duration: 1.5 + Math.random() * 0.5,
          yoyo: true,
          repeat: -1,
          delay,
          ease: "sine.inOut",
        });
      }
    }
  }

  resize(width: number, height: number) {
    this.app.renderer.resize(width, height);
    const totalSize = GRID_SIZE * CELL_SIZE;
    this.gridContainer.x = (width - totalSize) / 2;
    this.gridContainer.y = (height - totalSize) / 2;
  }

  destroy() {
    gsap.killTweensOf(this.gridContainer);
    this.app.destroy(false);
  }
}
