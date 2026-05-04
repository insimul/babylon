using UnityEngine;

namespace Insimul.World
{
    public class ProceduralDungeonGenerator : MonoBehaviour
    {
        public void GenerateDungeon(string seed, int floorCount, int roomsPerFloor)
        {
            // TODO: Generate dungeon rooms and corridors procedurally
            Debug.Log($"[Insimul] ProceduralDungeonGenerator — {floorCount} floors, {roomsPerFloor} rooms (seed: {seed})");
        }
    }
}
