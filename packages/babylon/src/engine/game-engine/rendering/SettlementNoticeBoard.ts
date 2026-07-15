/**
 * Settlement Notice Board
 *
 * Places a physical notice board mesh at the center of each settlement.
 * The board displays "pinned" notices that look like letters and flyers,
 * written by NPCs from that settlement in the target language.
 *
 * Clicking the board opens the BabylonNoticeBoardPanel filtered to
 * that settlement's notices. Reading notices awards reading XP and
 * can unlock quests.
 */

import {
  AbstractMesh,
  ActionManager,
  Color3,
  DynamicTexture,
  ExecuteCodeAction,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import type { NoticeArticle } from './BabylonNoticeBoardPanel';

/** Colors for different notice types on the board texture */
const NOTICE_COLORS: Record<string, { paper: string; ink: string; pin: string }> = {
  letter:        { paper: '#f5e6c8', ink: '#3a2a1a', pin: '#c44' },
  flyer:         { paper: '#fffbe6', ink: '#2a3a1a', pin: '#4a9' },
  official:      { paper: '#e8d5b5', ink: '#1a1a2a', pin: '#a86832' },
  wanted:        { paper: '#f8d8d8', ink: '#4a1a1a', pin: '#c44' },
  advertisement: { paper: '#d8f0e8', ink: '#1a2a1a', pin: '#4a9' },
};

const DEFAULT_NOTICE_COLOR = { paper: '#f0e4d0', ink: '#2a2015', pin: '#8b7355' };

export interface SettlementNoticeBoardConfig {
  settlementId: string;
  settlementName: string;
  position: Vector3;
  articles: NoticeArticle[];
  playerFluency: number;
}

export class SettlementNoticeBoard {
  private scene: Scene;
  private boards: Map<string, {
    root: TransformNode;
    meshes: Mesh[];
    articles: NoticeArticle[];
    boardTexture: DynamicTexture;
  }> = new Map();

  private onBoardClicked: ((settlementId: string, articles: NoticeArticle[]) => void) | null = null;
  private playerFluency: number = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public setPlayerFluency(fluency: number): void {
    this.playerFluency = fluency;
  }

  public setOnBoardClicked(cb: (settlementId: string, articles: NoticeArticle[]) => void): void {
    this.onBoardClicked = cb;
  }

  /** Get all settlement IDs that have a board. */
  public getSettlementIds(): string[] {
    return Array.from(this.boards.keys());
  }

  /** Get the current articles for a settlement's board. */
  public getArticles(settlementId: string): NoticeArticle[] {
    return this.boards.get(settlementId)?.articles || [];
  }

  /** Get the world position of the first notice board (for minimap markers). */
  public getBoardPosition(): { x: number; y: number; z: number } | null {
    const entries = Array.from(this.boards.values());
    if (entries.length > 0) {
      const p = entries[0].root.position;
      return { x: p.x, y: p.y, z: p.z };
    }
    return null;
  }

  /**
   * Create a physical notice board at a settlement's center position.
   * The board is offset slightly from the exact center so it doesn't overlap
   * with the settlement signpost.
   */
  public createBoard(config: SettlementNoticeBoardConfig): TransformNode {
    const { settlementId, settlementName, position, articles } = config;

    const root = new TransformNode(`noticeboard_root_${settlementId}`, this.scene);
    // Position is now provided by the town square generator (at the square edge)
    root.position = position.clone();

    const meshes: Mesh[] = [];

    // --- Wooden frame (back board) ---
    const backBoard = MeshBuilder.CreateBox(
      `noticeboard_back_${settlementId}`,
      { width: 3.5, height: 3, depth: 0.12 },
      this.scene
    );
    backBoard.position = new Vector3(0, 2.2, 0);
    backBoard.parent = root;

    const woodMat = new StandardMaterial(`noticeboard_wood_${settlementId}`, this.scene);
    woodMat.diffuseColor = new Color3(0.35, 0.22, 0.1);
    woodMat.specularColor = new Color3(0.05, 0.03, 0.01);
    backBoard.material = woodMat;
    meshes.push(backBoard);

    // --- Left support post ---
    const leftPost = MeshBuilder.CreateCylinder(
      `noticeboard_post_l_${settlementId}`,
      { height: 4, diameter: 0.18, tessellation: 8 },
      this.scene
    );
    leftPost.position = new Vector3(-1.6, 2, 0);
    leftPost.parent = root;
    leftPost.material = woodMat;
    meshes.push(leftPost);

    // --- Right support post ---
    const rightPost = MeshBuilder.CreateCylinder(
      `noticeboard_post_r_${settlementId}`,
      { height: 4, diameter: 0.18, tessellation: 8 },
      this.scene
    );
    rightPost.position = new Vector3(1.6, 2, 0);
    rightPost.parent = root;
    rightPost.material = woodMat;
    meshes.push(rightPost);

    // --- Small roof overhang ---
    const roof = MeshBuilder.CreateBox(
      `noticeboard_roof_${settlementId}`,
      { width: 4, height: 0.1, depth: 0.6 },
      this.scene
    );
    roof.position = new Vector3(0, 3.75, 0.1);
    roof.parent = root;

    const roofMat = new StandardMaterial(`noticeboard_roof_mat_${settlementId}`, this.scene);
    roofMat.diffuseColor = new Color3(0.25, 0.15, 0.08);
    roofMat.specularColor = Color3.Black();
    roof.material = roofMat;
    meshes.push(roof);

    // --- Notice surface (front face with pinned notices texture) ---
    const texW = 1024;
    const texH = 768;
    const boardTexture = new DynamicTexture(
      `noticeboard_tex_${settlementId}`,
      { width: texW, height: texH },
      this.scene,
      false
    );

    this.renderBoardTexture(boardTexture, articles, settlementName, texW, texH);

    const noticeSurface = MeshBuilder.CreatePlane(
      `noticeboard_surface_${settlementId}`,
      { width: 3.3, height: 2.8 },
      this.scene
    );
    noticeSurface.position = new Vector3(0, 2.2, 0.07);
    noticeSurface.rotation.y = Math.PI;
    noticeSurface.parent = root;

    const surfaceMat = new StandardMaterial(`noticeboard_surface_mat_${settlementId}`, this.scene);
    surfaceMat.diffuseTexture = boardTexture;
    surfaceMat.emissiveTexture = boardTexture;
    surfaceMat.disableLighting = true;
    surfaceMat.backFaceCulling = false;
    surfaceMat.useAlphaFromDiffuseTexture = true;
    noticeSurface.material = surfaceMat;
    noticeSurface.isPickable = true;
    meshes.push(noticeSurface);

    // --- Hover label: "Notice Board" ---
    const labelTex = new DynamicTexture(
      `noticeboard_label_tex_${settlementId}`,
      { width: 256, height: 48 },
      this.scene,
      false
    );
    const lctx = labelTex.getContext() as unknown as CanvasRenderingContext2D;
    lctx.clearRect(0, 0, 256, 48);
    lctx.fillStyle = 'rgba(20, 15, 10, 0.85)';
    this.roundRect(lctx, 2, 2, 252, 44, 8);
    lctx.fill();
    lctx.strokeStyle = '#c9a14a';
    lctx.lineWidth = 2;
    this.roundRect(lctx, 2, 2, 252, 44, 8);
    lctx.stroke();
    lctx.fillStyle = '#f5e6c8';
    lctx.font = 'bold 20px serif';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText('Notice Board', 128, 24);
    labelTex.update();
    labelTex.hasAlpha = true;

    const labelPlane = MeshBuilder.CreatePlane(
      `noticeboard_label_${settlementId}`,
      { width: 2, height: 0.4 },
      this.scene
    );
    labelPlane.position = new Vector3(0, 4.1, 0);
    labelPlane.parent = root;
    labelPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    labelPlane.isPickable = false;
    labelPlane.isVisible = false;

    const labelMat = new StandardMaterial(`noticeboard_label_mat_${settlementId}`, this.scene);
    labelMat.diffuseTexture = labelTex;
    labelMat.emissiveTexture = labelTex;
    labelMat.disableLighting = true;
    labelMat.backFaceCulling = false;
    labelMat.useAlphaFromDiffuseTexture = true;
    labelPlane.material = labelMat;
    meshes.push(labelPlane);

    // --- Interaction: hover shows label, click opens panel ---
    if (!noticeSurface.actionManager) {
      noticeSurface.actionManager = new ActionManager(this.scene);
    }

    noticeSurface.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
        labelPlane.isVisible = true;
      })
    );
    noticeSurface.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
        labelPlane.isVisible = false;
      })
    );
    noticeSurface.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.onBoardClicked?.(settlementId, this.boards.get(settlementId)?.articles || []);
      })
    );

    // Also make the back board clickable
    if (!backBoard.actionManager) {
      backBoard.actionManager = new ActionManager(this.scene);
    }
    backBoard.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
        labelPlane.isVisible = true;
      })
    );
    backBoard.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
        labelPlane.isVisible = false;
      })
    );
    backBoard.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.onBoardClicked?.(settlementId, this.boards.get(settlementId)?.articles || []);
      })
    );

    // LOD: hide at distance
    noticeSurface.addLODLevel(120, null);
    backBoard.addLODLevel(120, null);
    leftPost.addLODLevel(120, null);
    rightPost.addLODLevel(120, null);
    roof.addLODLevel(120, null);

    this.boards.set(settlementId, { root, meshes, articles, boardTexture });
    return root;
  }

  /**
   * Render the notice board texture with pinned flyers/letters.
   * Each notice is drawn as a slightly rotated "paper" rectangle
   * with hand-written-style text and a colored pin at the top.
   */
  private renderBoardTexture(
    texture: DynamicTexture,
    articles: NoticeArticle[],
    settlementName: string,
    w: number,
    h: number
  ): void {
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, w, h);

    // Cork board background
    ctx.fillStyle = '#b5936b';
    ctx.fillRect(0, 0, w, h);

    // Cork texture effect (subtle noise)
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const size = Math.random() * 3 + 1;
      ctx.fillStyle = `rgba(${150 + Math.random() * 40}, ${120 + Math.random() * 30}, ${80 + Math.random() * 30}, 0.3)`;
      ctx.fillRect(x, y, size, size);
    }

    // Header: settlement name
    ctx.fillStyle = 'rgba(40, 25, 15, 0.8)';
    this.roundRect(ctx, w / 2 - 180, 10, 360, 40, 6);
    ctx.fill();
    ctx.fillStyle = '#f5e6c8';
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(settlementName, w / 2, 30);

    // Draw up to 6 notices as "pinned papers"
    const visibleArticles = articles
      .filter(a => {
        if (a.difficulty === 'beginner') return true;
        if (a.difficulty === 'intermediate') return this.playerFluency >= 25;
        if (a.difficulty === 'advanced') return this.playerFluency >= 55;
        return true;
      })
      .slice(0, 6);

    // Layout: 2 columns, up to 3 rows
    const colW = (w - 60) / 2;
    const rowH = (h - 80) / 3;

    for (let i = 0; i < visibleArticles.length; i++) {
      const article = visibleArticles[i];
      const col = i % 2;
      const row = Math.floor(i / 2);

      const paperX = 30 + col * (colW + 10);
      const paperY = 60 + row * (rowH + 5);
      const paperW = colW - 10;
      const paperH = rowH - 15;

      // Slight random rotation for organic look
      const rotation = (Math.random() - 0.5) * 0.06;
      ctx.save();
      ctx.translate(paperX + paperW / 2, paperY + paperH / 2);
      ctx.rotate(rotation);
      ctx.translate(-(paperX + paperW / 2), -(paperY + paperH / 2));

      // Paper shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      this.roundRect(ctx, paperX + 3, paperY + 3, paperW, paperH, 3);
      ctx.fill();

      // Paper rectangle
      const colors = NOTICE_COLORS[article.noticeType || ''] || DEFAULT_NOTICE_COLOR;
      ctx.fillStyle = colors.paper;
      this.roundRect(ctx, paperX, paperY, paperW, paperH, 3);
      ctx.fill();

      // Paper border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      this.roundRect(ctx, paperX, paperY, paperW, paperH, 3);
      ctx.stroke();

      // Pin at top
      ctx.beginPath();
      ctx.arc(paperX + paperW / 2, paperY + 6, 5, 0, Math.PI * 2);
      ctx.fillStyle = colors.pin;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Pin highlight
      ctx.beginPath();
      ctx.arc(paperX + paperW / 2 - 1.5, paperY + 4.5, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();

      // Title text
      ctx.fillStyle = colors.ink;
      ctx.font = 'bold 16px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const titleMaxW = paperW - 20;
      ctx.fillText(article.title, paperX + 10, paperY + 16, titleMaxW);

      // Author
      if (article.author) {
        ctx.font = 'italic 11px serif';
        ctx.fillStyle = 'rgba(60, 40, 20, 0.6)';
        ctx.fillText(`\u2014 ${article.author.name}`, paperX + 10, paperY + 36, titleMaxW);
      }

      // Body preview (truncated)
      ctx.font = '12px serif';
      ctx.fillStyle = colors.ink;
      const bodyStartY = article.author ? 54 : 40;
      const maxBodyLines = Math.floor((paperH - bodyStartY - 10) / 15);
      const words = article.body.split(' ');
      let line = '';
      let lineNum = 0;
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > titleMaxW) {
          ctx.fillText(line, paperX + 10, paperY + bodyStartY + lineNum * 15, titleMaxW);
          line = word;
          lineNum++;
          if (lineNum >= maxBodyLines) {
            ctx.fillText('...', paperX + 10, paperY + bodyStartY + lineNum * 15, titleMaxW);
            break;
          }
        } else {
          line = testLine;
        }
      }
      if (lineNum < maxBodyLines && line) {
        ctx.fillText(line, paperX + 10, paperY + bodyStartY + lineNum * 15, titleMaxW);
      }

      ctx.restore();
    }

    // "Click to read" hint at bottom
    if (visibleArticles.length > 0) {
      ctx.fillStyle = 'rgba(40, 25, 15, 0.6)';
      ctx.font = 'italic 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Click to read notices', w / 2, h - 8);
    }

    texture.update();
    texture.hasAlpha = false;
  }

  /**
   * Update the articles on a settlement's board and re-render
   */
  public updateArticles(settlementId: string, articles: NoticeArticle[], settlementName: string): void {
    const board = this.boards.get(settlementId);
    if (!board) return;

    board.articles = articles;
    this.renderBoardTexture(board.boardTexture, articles, settlementName, 1024, 768);
  }

  /**
   * Get all meshes for a settlement's board (for scene manager registration)
   */
  public getBoardMeshes(settlementId: string): Mesh[] {
    return this.boards.get(settlementId)?.meshes || [];
  }

  /**
   * Get the root transform node for a settlement's board
   */
  public getBoardRoot(settlementId: string): TransformNode | null {
    return this.boards.get(settlementId)?.root || null;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  public dispose(): void {
    this.boards.forEach((board) => {
      board.meshes.forEach((mesh) => mesh.dispose());
      board.boardTexture.dispose();
      board.root.dispose();
    });
    this.boards.clear();
  }
}
