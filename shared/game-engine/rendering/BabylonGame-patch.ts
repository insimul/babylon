/**
 * Patch for BabylonGame to support data source injection
 * 
 * This file shows the minimal changes needed to make BabylonGame work
 * with either API or file-based data loading.
 */

// Add this to the BabylonGameConfig interface:
interface BabylonGameConfig {
  worldId: string;
  worldName: string;
  worldType?: string;
  userId?: string;
  authToken?: string;
  onBack?: () => void;
  dataSource?: DataSource; // Add this line
}

// In the BabylonGame class constructor:
export class BabylonGame {
  private config: BabylonGameConfig;
  private dataSource: DataSource;
  
  constructor(canvas: HTMLCanvasElement, config: BabylonGameConfig) {
    this.config = config;
    
    // Use injected data source or create default
    this.dataSource = config.dataSource || createDataSource(config.authToken);
    
    // ... rest of constructor
  }

  // Replace the loadWorldData method:
  private async loadWorldData(): Promise<void> {
    try {
      const worldId = this.config.worldId;

      // Use the data source instead of direct API calls
      const [
        world,
        characters,
        actions,
        baseActions,
        quests,
        settlements,
        rules,
        baseRules,
        countries,
        states,
        baseResources,
        assets,
        config3D
      ] = await Promise.all([
        this.dataSource.loadWorld(worldId),
        this.dataSource.loadCharacters(worldId),
        this.dataSource.loadActions(worldId),
        this.dataSource.loadBaseActions(),
        this.dataSource.loadQuests(worldId),
        this.dataSource.loadSettlements(worldId),
        this.dataSource.loadRules(worldId),
        this.dataSource.loadBaseRules(),
        this.dataSource.loadCountries(worldId),
        this.dataSource.loadStates(worldId),
        this.dataSource.loadBaseResources(worldId),
        this.dataSource.loadAssets(worldId),
        this.dataSource.loadConfig3D(worldId)
      ]);

      // Store the data (same as before)
      this.worldData = world;
      this.characters = characters;
      this.actions = [...actions, ...baseActions];
      this.quests = quests;
      this.settlements = settlements;
      this.rules = [...rules, ...baseRules];
      this.countries = countries;
      this.states = states;
      this.baseResources = baseResources;
      this.assets = assets;
      this.config3D = config3D;

    } catch (error) {
      console.error('[BabylonGame] Failed to load world data:', error);
      this.sceneStatus = "error";
      throw error;
    }
  }

  // Update other API calls to use the data source:
  private async startPlaythrough(): Promise<void> {
    if (!this.config.worldId) return;

    try {
      const playthrough = await this.dataSource.startPlaythrough(
        this.config.worldId,
        this.config.authToken || '',
        `${this.config.worldName} - Playthrough`
      );
      
      if (playthrough) {
        this.playthroughId = playthrough.id;
      }
    } catch (error) {
      console.error('[BabylonGame] Failed to start playthrough:', error);
      // Don't throw - continue without playthrough
    }
  }

  private async handleQuestObjectiveCompleted(questId: string, objectiveId: string, type: string): Promise<void> {
    try {
      // Get current quest data
      const quests = await this.dataSource.loadQuests(this.config.worldId);
      const quest = quests.find((q: any) => q.id === questId);
      if (!quest) return;

      // Update progress
      const progress = quest.progress || {
        completed: false,
        completedObjectives: [],
        visitedLocations: [],
        collectedItems: []
      };

      if (!progress.completedObjectives.includes(objectiveId)) {
        progress.completedObjectives.push(objectiveId);
      }

      const allObjectivesComplete = quest.objectives?.every((obj: any) => obj.completed);

      await this.dataSource.updateQuest(questId, {
        progress,
      });
    } catch (error) {
      console.error('[BabylonGame] Failed to update quest progress:', error);
    }
  }

  // Update settlement loading:
  private async loadSettlementDetails(settlement: any): Promise<void> {
    try {
      const [businesses, lots, residences] = await Promise.all([
        this.dataSource.loadSettlementBusinesses(settlement.id),
        this.dataSource.loadSettlementLots(settlement.id),
        this.dataSource.loadSettlementResidences(settlement.id)
      ]);

      // Store and use the data as before
      settlement.businesses = businesses;
      settlement.lots = lots;
      settlement.residences = residences;
    } catch (error) {
      console.error(`[BabylonGame] Failed to load details for settlement ${settlement.id}:`, error);
    }
  }
}

// Export the modified interfaces
export interface DataSource {
  loadWorld(worldId: string): Promise<any>;
  loadCharacters(worldId: string): Promise<any[]>;
  loadActions(worldId: string): Promise<any[]>;
  loadBaseActions(): Promise<any[]>;
  loadQuests(worldId: string): Promise<any[]>;
  loadSettlements(worldId: string): Promise<any[]>;
  loadRules(worldId: string): Promise<any[]>;
  loadBaseRules(): Promise<any[]>;
  loadCountries(worldId: string): Promise<any[]>;
  loadStates(worldId: string): Promise<any[]>;
  loadBaseResources(worldId: string): Promise<any>;
  loadAssets(worldId: string): Promise<any[]>;
  loadConfig3D(worldId: string): Promise<any>;
  loadTruths(worldId: string, playthroughId?: string): Promise<any[]>;
  loadCharacter(characterId: string): Promise<any>;
  startPlaythrough(worldId: string, authToken: string, playthroughName: string): Promise<any>;
  updateQuest(questId: string, data: any): Promise<void>;
  loadSettlementBusinesses(settlementId: string): Promise<any[]>;
  loadSettlementLots(settlementId: string): Promise<any[]>;
  loadSettlementResidences(settlementId: string): Promise<any[]>;
}
