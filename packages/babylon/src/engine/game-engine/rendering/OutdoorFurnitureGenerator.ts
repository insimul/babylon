/**
 * OutdoorFurnitureGenerator - Creates procedural outdoor furniture and market stalls
 * for settlement exteriors. Supports world-type-specific furniture sets.
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

export type OutdoorFurnitureType =
  | 'lamp_post'
  | 'bench'
  | 'well'
  | 'barrel'
  | 'crate'
  | 'market_stall'
  | 'streetlight'
  | 'terminal'
  | 'planter'
  | 'picnic_table'
  | 'chair_set'
  | 'flower_cart'
  | 'signpost'
  | 'water_trough'
  | 'hanging_lantern'
  | 'food_stall'
  | 'weapon_rack';

/** Returns world-type-appropriate furniture sets including new outdoor types. */
export function getFurnitureSet(worldType: string): OutdoorFurnitureType[] {
  const wt = (worldType || '').toLowerCase();

  if (wt.includes('medieval') || wt.includes('fantasy')) {
    return ['lamp_post', 'bench', 'well', 'barrel', 'crate', 'market_stall',
            'picnic_table', 'flower_cart', 'signpost', 'water_trough',
            'hanging_lantern', 'food_stall', 'weapon_rack'];
  } else if (wt.includes('cyberpunk') || wt.includes('sci-fi') || wt.includes('modern')) {
    return ['streetlight', 'bench', 'terminal', 'planter', 'crate',
            'picnic_table', 'chair_set'];
  } else if (wt.includes('western') || wt.includes('frontier')) {
    return ['barrel', 'crate', 'lamp_post', 'bench', 'well',
            'water_trough', 'signpost', 'food_stall'];
  } else {
    return ['lamp_post', 'bench', 'barrel', 'planter',
            'picnic_table', 'signpost', 'flower_cart'];
  }
}

/** Role mapping for template-based furniture (glTF models). */
export const FURNITURE_ROLE_MAP: Record<string, string[]> = {
  'lamp_post': ['lamp', 'lamp_table'],
  'streetlight': ['lamp', 'lamp_table'],
  'barrel': ['storage', 'storage_alt'],
  'crate': ['chest', 'storage'],
  'bench': ['furniture_stool', 'furniture_chair'],
  'well': ['prop', 'decoration'],
  'market_stall': ['furniture_table'],
  'terminal': ['electronics', 'prop'],
  'planter': ['decoration', 'prop'],
  'picnic_table': ['furniture_table'],
  'chair_set': ['furniture_chair', 'furniture_stool'],
  'flower_cart': ['decoration', 'prop'],
  'signpost': ['prop', 'decoration'],
  'water_trough': ['prop', 'storage'],
  'hanging_lantern': ['lamp', 'lamp_table'],
  'food_stall': ['furniture_table'],
  'weapon_rack': ['prop', 'decoration'],
};

/** Target heights for scaling template models. */
export const FURNITURE_SIZE_MAP: Record<string, number> = {
  'lamp_post': 2.5,
  'streetlight': 3.0,
  'bench': 0.8,
  'well': 1.2,
  'barrel': 0.8,
  'crate': 0.6,
  'market_stall': 2.0,
  'terminal': 1.2,
  'planter': 0.6,
  'picnic_table': 1.0,
  'chair_set': 0.9,
  'flower_cart': 1.2,
  'signpost': 2.5,
  'water_trough': 0.7,
  'hanging_lantern': 2.0,
  'food_stall': 2.0,
  'weapon_rack': 2.0,
};

export class OutdoorFurnitureGenerator {
  private materialCache: Map<string, StandardMaterial>;

  constructor(materialCache: Map<string, StandardMaterial>) {
    this.materialCache = materialCache;
  }

  private getMat(key: string, create: () => StandardMaterial): StandardMaterial {
    let mat = this.materialCache.get(key);
    if (!mat) {
      mat = create();
      this.materialCache.set(key, mat);
    }
    return mat;
  }

  /**
   * Create a procedural furniture mesh. Returns null if the type is unknown.
   * This handles only the NEW types added by this module. The caller should
   * fall through to existing creation logic for original types.
   */
  createOutdoorFurniture(type: string, name: string, scene: Scene): Mesh | null {
    switch (type) {
      case 'picnic_table': return this.createPicnicTable(name, scene);
      case 'chair_set': return this.createChairSet(name, scene);
      case 'flower_cart': return this.createFlowerCart(name, scene);
      case 'signpost': return this.createSignpost(name, scene);
      case 'water_trough': return this.createWaterTrough(name, scene);
      case 'hanging_lantern': return this.createHangingLantern(name, scene);
      case 'food_stall': return this.createFoodStall(name, scene);
      case 'weapon_rack': return this.createWeaponRack(name, scene);
      case 'market_stall': return this.createEnhancedMarketStall(name, scene);
      default: return null;
    }
  }

  /** Enhanced market stall with legs, shelf, and displayed goods. */
  private createEnhancedMarketStall(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const woodMat = this.getMat('furn_stall_wood', () => {
      const m = new StandardMaterial('furn_stall_wood', scene);
      m.diffuseColor = new Color3(0.5, 0.35, 0.2);
      m.specularColor = Color3.Black();
      return m;
    });

    // Table top
    const table = MeshBuilder.CreateBox(`${name}_table`, { width: 2.5, height: 0.1, depth: 1.2 }, scene);
    table.position.y = 1;
    table.parent = parent;
    table.material = woodMat;

    // Four legs
    for (const [dx, dz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) {
      const leg = MeshBuilder.CreateCylinder(`${name}_leg_${dx}_${dz}`, { height: 1, diameter: 0.1, tessellation: 6 }, scene);
      leg.position = new Vector3(dx, 0.5, dz);
      leg.parent = parent;
      leg.material = woodMat;
    }

    // Back shelf (lower display shelf)
    const shelf = MeshBuilder.CreateBox(`${name}_shelf`, { width: 2.3, height: 0.06, depth: 0.5 }, scene);
    shelf.position = new Vector3(0, 1.5, -0.3);
    shelf.parent = parent;
    shelf.material = woodMat;

    // Two support posts for the awning
    for (const dx of [-1.1, 1.1]) {
      const post = MeshBuilder.CreateCylinder(`${name}_awning_post_${dx}`, { height: 1.6, diameter: 0.08, tessellation: 6 }, scene);
      post.position = new Vector3(dx, 1.8, -0.5);
      post.parent = parent;
      post.material = woodMat;
    }

    // Awning (angled canopy)
    const awning = MeshBuilder.CreateBox(`${name}_awning`, { width: 2.8, height: 0.05, depth: 1.5 }, scene);
    awning.position = new Vector3(0, 2.6, 0);
    awning.rotation.x = 0.15; // slight forward tilt
    awning.parent = parent;
    awning.material = this.getMat('furn_awning', () => {
      const m = new StandardMaterial('furn_awning', scene);
      m.diffuseColor = new Color3(0.7, 0.2, 0.15);
      m.specularColor = Color3.Black();
      return m;
    });

    // Displayed goods (small boxes on table)
    const goodsMat = this.getMat('furn_stall_goods', () => {
      const m = new StandardMaterial('furn_stall_goods', scene);
      m.diffuseColor = new Color3(0.8, 0.65, 0.3);
      m.specularColor = Color3.Black();
      return m;
    });
    for (const dx of [-0.7, 0, 0.7]) {
      const good = MeshBuilder.CreateBox(`${name}_good_${dx}`, { width: 0.35, height: 0.2, depth: 0.3 }, scene);
      good.position = new Vector3(dx, 1.15, 0);
      good.parent = parent;
      good.material = goodsMat;
    }

    return parent;
  }

  /** Picnic table with attached benches. */
  private createPicnicTable(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const woodMat = this.getMat('furn_picnic_wood', () => {
      const m = new StandardMaterial('furn_picnic_wood', scene);
      m.diffuseColor = new Color3(0.45, 0.32, 0.2);
      m.specularColor = Color3.Black();
      return m;
    });

    // Table top
    const top = MeshBuilder.CreateBox(`${name}_top`, { width: 2.0, height: 0.1, depth: 0.8 }, scene);
    top.position.y = 0.75;
    top.parent = parent;
    top.material = woodMat;

    // Two A-frame legs
    for (const dx of [-0.7, 0.7]) {
      const leg = MeshBuilder.CreateBox(`${name}_leg_${dx}`, { width: 0.1, height: 0.75, depth: 0.9 }, scene);
      leg.position = new Vector3(dx, 0.375, 0);
      leg.parent = parent;
      leg.material = woodMat;
    }

    // Two bench seats on either side
    for (const dz of [-0.6, 0.6]) {
      const seat = MeshBuilder.CreateBox(`${name}_bench_${dz}`, { width: 1.8, height: 0.08, depth: 0.3 }, scene);
      seat.position = new Vector3(0, 0.45, dz);
      seat.parent = parent;
      seat.material = woodMat;
    }

    return parent;
  }

  /** Small seating area with two chairs and a small round table. */
  private createChairSet(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const metalMat = this.getMat('furn_chair_metal', () => {
      const m = new StandardMaterial('furn_chair_metal', scene);
      m.diffuseColor = new Color3(0.35, 0.35, 0.38);
      m.specularColor = new Color3(0.2, 0.2, 0.2);
      return m;
    });

    // Small round table
    const tabletop = MeshBuilder.CreateCylinder(`${name}_tabletop`, { height: 0.06, diameter: 0.8, tessellation: 8 }, scene);
    tabletop.position.y = 0.7;
    tabletop.parent = parent;
    tabletop.material = metalMat;

    const tableLeg = MeshBuilder.CreateCylinder(`${name}_tableleg`, { height: 0.7, diameter: 0.08, tessellation: 6 }, scene);
    tableLeg.position.y = 0.35;
    tableLeg.parent = parent;
    tableLeg.material = metalMat;

    // Two chairs
    for (const dz of [-0.7, 0.7]) {
      const seat = MeshBuilder.CreateBox(`${name}_seat_${dz}`, { width: 0.4, height: 0.05, depth: 0.4 }, scene);
      seat.position = new Vector3(0, 0.45, dz);
      seat.parent = parent;
      seat.material = metalMat;

      const back = MeshBuilder.CreateBox(`${name}_back_${dz}`, { width: 0.4, height: 0.4, depth: 0.05 }, scene);
      back.position = new Vector3(0, 0.65, dz + (dz > 0 ? 0.18 : -0.18));
      back.parent = parent;
      back.material = metalMat;
    }

    return parent;
  }

  /** Flower cart with wheels and potted plants. */
  private createFlowerCart(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const woodMat = this.getMat('furn_cart_wood', () => {
      const m = new StandardMaterial('furn_cart_wood', scene);
      m.diffuseColor = new Color3(0.55, 0.4, 0.25);
      m.specularColor = Color3.Black();
      return m;
    });

    // Cart bed
    const bed = MeshBuilder.CreateBox(`${name}_bed`, { width: 1.6, height: 0.08, depth: 0.8 }, scene);
    bed.position.y = 0.6;
    bed.parent = parent;
    bed.material = woodMat;

    // Side rails
    for (const dz of [-0.38, 0.38]) {
      const rail = MeshBuilder.CreateBox(`${name}_rail_${dz}`, { width: 1.6, height: 0.2, depth: 0.05 }, scene);
      rail.position = new Vector3(0, 0.74, dz);
      rail.parent = parent;
      rail.material = woodMat;
    }

    // Two wheels
    for (const dx of [-0.6, 0.6]) {
      const wheel = MeshBuilder.CreateTorus(`${name}_wheel_${dx}`, { diameter: 0.5, thickness: 0.08, tessellation: 8 }, scene);
      wheel.position = new Vector3(dx, 0.25, 0.5);
      wheel.rotation.x = Math.PI / 2;
      wheel.parent = parent;
      wheel.material = woodMat;
    }

    // Flower pots (colored spheres on the cart bed)
    const flowerColors = [
      new Color3(0.8, 0.2, 0.3),
      new Color3(0.9, 0.7, 0.2),
      new Color3(0.6, 0.2, 0.7),
    ];
    for (let i = 0; i < 3; i++) {
      const pot = MeshBuilder.CreateCylinder(`${name}_pot_${i}`, { height: 0.2, diameterTop: 0.22, diameterBottom: 0.15, tessellation: 6 }, scene);
      pot.position = new Vector3(-0.45 + i * 0.45, 0.74, 0);
      pot.parent = parent;
      pot.material = this.getMat('furn_pot_clay', () => {
        const m = new StandardMaterial('furn_pot_clay', scene);
        m.diffuseColor = new Color3(0.6, 0.4, 0.3);
        m.specularColor = Color3.Black();
        return m;
      });

      const flower = MeshBuilder.CreateSphere(`${name}_flower_${i}`, { diameter: 0.25, segments: 5 }, scene);
      flower.position = new Vector3(-0.45 + i * 0.45, 0.92, 0);
      flower.parent = parent;
      const matKey = `furn_flower_${i}`;
      const color = flowerColors[i];
      flower.material = this.getMat(matKey, () => {
        const m = new StandardMaterial(matKey, scene);
        m.diffuseColor = color;
        return m;
      });
    }

    return parent;
  }

  /** Wooden signpost with directional sign board. */
  private createSignpost(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const woodMat = this.getMat('furn_sign_wood', () => {
      const m = new StandardMaterial('furn_sign_wood', scene);
      m.diffuseColor = new Color3(0.4, 0.3, 0.18);
      m.specularColor = Color3.Black();
      return m;
    });

    // Post
    const post = MeshBuilder.CreateCylinder(`${name}_post`, { height: 2.5, diameter: 0.12, tessellation: 6 }, scene);
    post.position.y = 1.25;
    post.parent = parent;
    post.material = woodMat;

    // Sign board (angled arrow shape approximated by a box)
    const board = MeshBuilder.CreateBox(`${name}_board`, { width: 1.0, height: 0.3, depth: 0.05 }, scene);
    board.position = new Vector3(0.4, 2.1, 0);
    board.parent = parent;
    board.material = this.getMat('furn_sign_board', () => {
      const m = new StandardMaterial('furn_sign_board', scene);
      m.diffuseColor = new Color3(0.55, 0.42, 0.25);
      m.specularColor = Color3.Black();
      return m;
    });

    // Second sign pointing the other way (lower)
    const board2 = MeshBuilder.CreateBox(`${name}_board2`, { width: 0.8, height: 0.25, depth: 0.05 }, scene);
    board2.position = new Vector3(-0.3, 1.75, 0);
    board2.parent = parent;
    board2.material = board.material!;

    return parent;
  }

  /** Stone water trough for animals. */
  private createWaterTrough(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const stoneMat = this.getMat('furn_trough_stone', () => {
      const m = new StandardMaterial('furn_trough_stone', scene);
      m.diffuseColor = new Color3(0.5, 0.48, 0.42);
      m.specularColor = Color3.Black();
      return m;
    });

    // Outer trough (box)
    const outer = MeshBuilder.CreateBox(`${name}_outer`, { width: 1.8, height: 0.6, depth: 0.7 }, scene);
    outer.position.y = 0.3;
    outer.parent = parent;
    outer.material = stoneMat;

    // Water surface
    const water = MeshBuilder.CreateBox(`${name}_water`, { width: 1.6, height: 0.02, depth: 0.5 }, scene);
    water.position.y = 0.5;
    water.parent = parent;
    water.material = this.getMat('furn_trough_water', () => {
      const m = new StandardMaterial('furn_trough_water', scene);
      m.diffuseColor = new Color3(0.2, 0.35, 0.5);
      m.specularColor = new Color3(0.3, 0.3, 0.3);
      m.alpha = 0.8;
      return m;
    });

    return parent;
  }

  /** Hanging lantern on a post with a warm glow. */
  private createHangingLantern(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const ironMat = this.getMat('furn_lantern_iron', () => {
      const m = new StandardMaterial('furn_lantern_iron', scene);
      m.diffuseColor = new Color3(0.2, 0.2, 0.22);
      m.specularColor = new Color3(0.15, 0.15, 0.15);
      return m;
    });

    // Post
    const post = MeshBuilder.CreateCylinder(`${name}_post`, { height: 2.2, diameter: 0.1, tessellation: 6 }, scene);
    post.position.y = 1.1;
    post.parent = parent;
    post.material = ironMat;

    // Arm extending to the side
    const arm = MeshBuilder.CreateCylinder(`${name}_arm`, { height: 0.6, diameter: 0.06, tessellation: 4 }, scene);
    arm.position = new Vector3(0.3, 2.1, 0);
    arm.rotation.z = Math.PI / 2;
    arm.parent = parent;
    arm.material = ironMat;

    // Lantern housing (small box)
    const housing = MeshBuilder.CreateBox(`${name}_housing`, { width: 0.2, height: 0.3, depth: 0.2 }, scene);
    housing.position = new Vector3(0.55, 1.95, 0);
    housing.parent = parent;
    housing.material = ironMat;

    // Glow inside
    const glow = MeshBuilder.CreateSphere(`${name}_glow`, { diameter: 0.15, segments: 5 }, scene);
    glow.position = new Vector3(0.55, 1.95, 0);
    glow.parent = parent;
    glow.material = this.getMat('furn_lantern_glow', () => {
      const m = new StandardMaterial('furn_lantern_glow', scene);
      m.diffuseColor = new Color3(1, 0.85, 0.5);
      m.emissiveColor = new Color3(0.5, 0.4, 0.2);
      return m;
    });

    return parent;
  }

  /** Food stall with counter, awning, and food items on display. */
  private createFoodStall(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const woodMat = this.getMat('furn_food_stall_wood', () => {
      const m = new StandardMaterial('furn_food_stall_wood', scene);
      m.diffuseColor = new Color3(0.52, 0.38, 0.22);
      m.specularColor = Color3.Black();
      return m;
    });

    // Counter
    const counter = MeshBuilder.CreateBox(`${name}_counter`, { width: 2.2, height: 0.1, depth: 1.0 }, scene);
    counter.position.y = 0.95;
    counter.parent = parent;
    counter.material = woodMat;

    // Four legs
    for (const [dx, dz] of [[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]]) {
      const leg = MeshBuilder.CreateCylinder(`${name}_leg_${dx}_${dz}`, { height: 0.95, diameter: 0.09, tessellation: 6 }, scene);
      leg.position = new Vector3(dx, 0.475, dz);
      leg.parent = parent;
      leg.material = woodMat;
    }

    // Awning posts
    for (const dx of [-0.95, 0.95]) {
      const post = MeshBuilder.CreateCylinder(`${name}_apost_${dx}`, { height: 1.5, diameter: 0.07, tessellation: 6 }, scene);
      post.position = new Vector3(dx, 1.75, -0.4);
      post.parent = parent;
      post.material = woodMat;
    }

    // Striped awning
    const awning = MeshBuilder.CreateBox(`${name}_awning`, { width: 2.5, height: 0.04, depth: 1.3 }, scene);
    awning.position = new Vector3(0, 2.5, 0);
    awning.rotation.x = 0.12;
    awning.parent = parent;
    awning.material = this.getMat('furn_food_awning', () => {
      const m = new StandardMaterial('furn_food_awning', scene);
      m.diffuseColor = new Color3(0.9, 0.75, 0.3);
      m.specularColor = Color3.Black();
      return m;
    });

    // Food items (small cylinders/spheres on counter)
    const foodMat = this.getMat('furn_food_items', () => {
      const m = new StandardMaterial('furn_food_items', scene);
      m.diffuseColor = new Color3(0.7, 0.5, 0.25);
      m.specularColor = Color3.Black();
      return m;
    });
    for (const dx of [-0.5, 0, 0.5]) {
      const item = MeshBuilder.CreateCylinder(`${name}_food_${dx}`, { height: 0.15, diameter: 0.3, tessellation: 6 }, scene);
      item.position = new Vector3(dx, 1.08, 0.1);
      item.parent = parent;
      item.material = foodMat;
    }

    return parent;
  }

  /** Weapon/tool rack with hanging items. */
  private createWeaponRack(name: string, scene: Scene): Mesh {
    const parent = new Mesh(name, scene);
    const woodMat = this.getMat('furn_rack_wood', () => {
      const m = new StandardMaterial('furn_rack_wood', scene);
      m.diffuseColor = new Color3(0.4, 0.28, 0.18);
      m.specularColor = Color3.Black();
      return m;
    });

    // Two vertical posts
    for (const dx of [-0.6, 0.6]) {
      const post = MeshBuilder.CreateCylinder(`${name}_post_${dx}`, { height: 2.0, diameter: 0.1, tessellation: 6 }, scene);
      post.position = new Vector3(dx, 1.0, 0);
      post.parent = parent;
      post.material = woodMat;
    }

    // Horizontal crossbar
    const bar = MeshBuilder.CreateCylinder(`${name}_bar`, { height: 1.3, diameter: 0.07, tessellation: 6 }, scene);
    bar.position = new Vector3(0, 1.6, 0);
    bar.rotation.z = Math.PI / 2;
    bar.parent = parent;
    bar.material = woodMat;

    // Lower crossbar
    const bar2 = MeshBuilder.CreateCylinder(`${name}_bar2`, { height: 1.3, diameter: 0.07, tessellation: 6 }, scene);
    bar2.position = new Vector3(0, 0.9, 0);
    bar2.rotation.z = Math.PI / 2;
    bar2.parent = parent;
    bar2.material = woodMat;

    // Hanging items (elongated boxes as weapon silhouettes)
    const metalMat = this.getMat('furn_rack_metal', () => {
      const m = new StandardMaterial('furn_rack_metal', scene);
      m.diffuseColor = new Color3(0.45, 0.45, 0.48);
      m.specularColor = new Color3(0.2, 0.2, 0.2);
      return m;
    });
    for (const dx of [-0.3, 0.1, 0.4]) {
      const weapon = MeshBuilder.CreateBox(`${name}_weapon_${dx}`, { width: 0.06, height: 0.8, depth: 0.04 }, scene);
      weapon.position = new Vector3(dx, 1.2, 0.05);
      weapon.parent = parent;
      weapon.material = metalMat;
    }

    return parent;
  }
}
