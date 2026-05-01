/**
 * VehicleSystem — Manages player vehicles (bicycle, horse) for faster travel.
 *
 * Press B to cycle through: on foot → bicycle → horse → on foot.
 * Each vehicle type applies a speed multiplier to the CharacterController.
 * A simple procedural mesh is parented to the player to represent the vehicle.
 */

import {
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Color3,
  Vector3,
  TransformNode,
} from "@babylonjs/core";
import type { CharacterController } from "./CharacterController";
import type { GameEventBus } from "../logic/GameEventBus";

export type VehicleType = 'bicycle' | 'horse';

export interface VehicleConfig {
  type: VehicleType;
  walkSpeedMultiplier: number;
  runSpeedMultiplier: number;
  turnSpeedMultiplier: number;
  label: string;
}

const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
  bicycle: {
    type: 'bicycle',
    walkSpeedMultiplier: 2.0,
    runSpeedMultiplier: 1.8,
    turnSpeedMultiplier: 1.2,
    label: 'Bicycle',
  },
  horse: {
    type: 'horse',
    walkSpeedMultiplier: 3.0,
    runSpeedMultiplier: 2.5,
    turnSpeedMultiplier: 0.8,
    label: 'Horse',
  },
};

const VEHICLE_CYCLE: (VehicleType | null)[] = [null, 'bicycle', 'horse'];

export class VehicleSystem {
  private scene: Scene;
  private playerMesh: Mesh;
  private controller: CharacterController;
  private eventBus: GameEventBus | null;

  private currentVehicle: VehicleType | null = null;
  private vehicleMesh: TransformNode | null = null;

  private baseWalkSpeed: number;
  private baseRunSpeed: number;
  private baseTurnSpeed: number;

  constructor(
    scene: Scene,
    playerMesh: Mesh,
    controller: CharacterController,
    baseWalkSpeed: number,
    baseRunSpeed: number,
    baseTurnSpeed: number,
    eventBus?: GameEventBus,
  ) {
    this.scene = scene;
    this.playerMesh = playerMesh;
    this.controller = controller;
    this.baseWalkSpeed = baseWalkSpeed;
    this.baseRunSpeed = baseRunSpeed;
    this.baseTurnSpeed = baseTurnSpeed;
    this.eventBus = eventBus ?? null;
  }

  get mounted(): boolean {
    return this.currentVehicle !== null;
  }

  get vehicleType(): VehicleType | null {
    return this.currentVehicle;
  }

  /** Cycle to the next vehicle (on foot → bicycle → horse → on foot). */
  cycleVehicle(): void {
    const currentIndex = VEHICLE_CYCLE.indexOf(this.currentVehicle);
    const nextIndex = (currentIndex + 1) % VEHICLE_CYCLE.length;
    const next = VEHICLE_CYCLE[nextIndex];

    if (next === null) {
      this.dismount();
    } else {
      this.mount(next);
    }
  }

  mount(type: VehicleType): void {
    // Dismount current vehicle first if switching
    if (this.currentVehicle !== null) {
      this.removeVehicleMesh();
    }

    this.currentVehicle = type;
    const config = VEHICLE_CONFIGS[type];

    // Apply speed multipliers
    this.controller.setWalkSpeed(this.baseWalkSpeed * config.walkSpeedMultiplier);
    this.controller.setRunSpeed(this.baseRunSpeed * config.runSpeedMultiplier);
    this.controller.setTurnSpeed(this.baseTurnSpeed * config.turnSpeedMultiplier);
    this.controller.setLeftSpeed(this.baseWalkSpeed * config.walkSpeedMultiplier * 0.8);
    this.controller.setRightSpeed(this.baseWalkSpeed * config.walkSpeedMultiplier * 0.8);
    this.controller.setBackSpeed(this.baseWalkSpeed * config.walkSpeedMultiplier * 0.5);

    this.createVehicleMesh(type);

    this.eventBus?.emit({ type: 'vehicle_mounted', vehicleType: type });
  }

  dismount(): void {
    if (this.currentVehicle === null) return;

    const prevType = this.currentVehicle;
    this.currentVehicle = null;

    // Restore base speeds
    this.controller.setWalkSpeed(this.baseWalkSpeed);
    this.controller.setRunSpeed(this.baseRunSpeed);
    this.controller.setTurnSpeed(this.baseTurnSpeed);
    this.controller.setLeftSpeed(this.baseWalkSpeed * 0.8);
    this.controller.setRightSpeed(this.baseWalkSpeed * 0.8);
    this.controller.setBackSpeed(this.baseWalkSpeed * 0.6);

    this.removeVehicleMesh();

    this.eventBus?.emit({ type: 'vehicle_dismounted', vehicleType: prevType });
  }

  /** Get current vehicle config or null if on foot. */
  getConfig(): VehicleConfig | null {
    return this.currentVehicle ? VEHICLE_CONFIGS[this.currentVehicle] : null;
  }

  /** Get the label for the current state. */
  getLabel(): string {
    return this.currentVehicle ? VEHICLE_CONFIGS[this.currentVehicle].label : 'On Foot';
  }

  dispose(): void {
    this.dismount();
  }

  // ── Mesh creation ─────────────────────────────────────────────────────────

  private createVehicleMesh(type: VehicleType): void {
    this.removeVehicleMesh();

    if (type === 'bicycle') {
      this.vehicleMesh = this.createBicycleMesh();
    } else {
      this.vehicleMesh = this.createHorseMesh();
    }

    // Parent to player so it moves with them
    this.vehicleMesh.parent = this.playerMesh;
  }

  private removeVehicleMesh(): void {
    if (this.vehicleMesh) {
      this.vehicleMesh.dispose();
      this.vehicleMesh = null;
    }
  }

  private createBicycleMesh(): TransformNode {
    const root = new TransformNode("vehicle_bicycle", this.scene);

    const mat = new StandardMaterial("bicycle_mat", this.scene);
    mat.diffuseColor = new Color3(0.2, 0.2, 0.8);
    mat.specularColor = new Color3(0.3, 0.3, 0.3);

    // Frame — a thin box tilted slightly
    const frame = MeshBuilder.CreateBox("bike_frame", { width: 0.15, height: 0.6, depth: 1.2 }, this.scene);
    frame.material = mat;
    frame.position = new Vector3(0, 0.4, 0);
    frame.rotation.x = -0.15;
    frame.parent = root;

    // Front wheel
    const wheelMat = new StandardMaterial("bike_wheel_mat", this.scene);
    wheelMat.diffuseColor = new Color3(0.1, 0.1, 0.1);

    const frontWheel = MeshBuilder.CreateTorus("bike_front_wheel", { diameter: 0.6, thickness: 0.06, tessellation: 16 }, this.scene);
    frontWheel.material = wheelMat;
    frontWheel.position = new Vector3(0, 0.3, 0.5);
    frontWheel.rotation.x = Math.PI / 2;
    frontWheel.parent = root;

    // Rear wheel
    const rearWheel = MeshBuilder.CreateTorus("bike_rear_wheel", { diameter: 0.6, thickness: 0.06, tessellation: 16 }, this.scene);
    rearWheel.material = wheelMat;
    rearWheel.position = new Vector3(0, 0.3, -0.5);
    rearWheel.rotation.x = Math.PI / 2;
    rearWheel.parent = root;

    // Handlebars
    const handlebar = MeshBuilder.CreateBox("bike_handlebar", { width: 0.6, height: 0.05, depth: 0.05 }, this.scene);
    handlebar.material = mat;
    handlebar.position = new Vector3(0, 0.85, 0.45);
    handlebar.parent = root;

    // Position below and around the player
    root.position = new Vector3(0, -0.8, 0);

    return root;
  }

  private createHorseMesh(): TransformNode {
    const root = new TransformNode("vehicle_horse", this.scene);

    const bodyMat = new StandardMaterial("horse_mat", this.scene);
    bodyMat.diffuseColor = new Color3(0.55, 0.35, 0.17);

    // Body — elongated box
    const body = MeshBuilder.CreateBox("horse_body", { width: 0.8, height: 0.7, depth: 1.8 }, this.scene);
    body.material = bodyMat;
    body.position = new Vector3(0, 0.5, 0);
    body.parent = root;

    // Head
    const headMat = new StandardMaterial("horse_head_mat", this.scene);
    headMat.diffuseColor = new Color3(0.5, 0.3, 0.15);

    const head = MeshBuilder.CreateBox("horse_head", { width: 0.35, height: 0.4, depth: 0.6 }, this.scene);
    head.material = headMat;
    head.position = new Vector3(0, 0.95, 1.0);
    head.rotation.x = 0.3;
    head.parent = root;

    // Legs (4 cylinders)
    const legMat = new StandardMaterial("horse_leg_mat", this.scene);
    legMat.diffuseColor = new Color3(0.45, 0.28, 0.12);

    const legPositions = [
      new Vector3(-0.25, 0, 0.6),
      new Vector3(0.25, 0, 0.6),
      new Vector3(-0.25, 0, -0.6),
      new Vector3(0.25, 0, -0.6),
    ];

    legPositions.forEach((pos, i) => {
      const leg = MeshBuilder.CreateCylinder(`horse_leg_${i}`, { height: 0.8, diameter: 0.15, tessellation: 8 }, this.scene);
      leg.material = legMat;
      leg.position = pos.add(new Vector3(0, 0.1, 0));
      leg.parent = root;
    });

    // Tail
    const tail = MeshBuilder.CreateCylinder("horse_tail", { height: 0.6, diameter: 0.08, tessellation: 6 }, this.scene);
    tail.material = bodyMat;
    tail.position = new Vector3(0, 0.6, -1.1);
    tail.rotation.x = -0.5;
    tail.parent = root;

    // Position below the player
    root.position = new Vector3(0, -1.2, 0);

    return root;
  }
}

/** Static accessor for vehicle configs (useful for tests). */
export { VEHICLE_CONFIGS, VEHICLE_CYCLE };
