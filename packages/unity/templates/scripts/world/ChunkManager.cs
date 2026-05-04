using UnityEngine;
using System.Collections.Generic;

namespace Insimul.World
{
    /// <summary>
    /// Spatial partitioning and streaming system.
    /// Matches shared/game-engine/rendering/ChunkManager.ts.
    /// Divides the world into chunks for efficient culling and loading/unloading
    /// of settlements, buildings, NPCs, and nature objects.
    /// </summary>
    public class ChunkManager : MonoBehaviour
    {
        public const float CHUNK_SIZE = 64f;

        [Header("Streaming")]
        [Tooltip("Number of chunks around the player to keep active")]
        public int activeRadius = 3;
        [Tooltip("How often to re-evaluate chunks (seconds)")]
        public float updateInterval = 0.3f;

        private Dictionary<Vector2Int, Chunk> _chunks = new Dictionary<Vector2Int, Chunk>();
        private HashSet<Vector2Int> _activeChunks = new HashSet<Vector2Int>();
        private Vector2Int _lastPlayerChunk = new Vector2Int(int.MinValue, int.MinValue);
        private Transform _playerTransform;
        private float _nextUpdateTime;

        /// <summary>
        /// Data stored per chunk.
        /// </summary>
        public class Chunk
        {
            public Vector2Int coord;
            public Bounds worldBounds;
            public List<GameObject> objects = new List<GameObject>();
            public bool isActive;
        }

        void Start()
        {
            var player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
                _playerTransform = player.transform;
        }

        void Update()
        {
            if (_playerTransform == null || Time.time < _nextUpdateTime)
                return;

            _nextUpdateTime = Time.time + updateInterval;

            Vector2Int playerChunk = WorldToChunk(_playerTransform.position);
            if (playerChunk != _lastPlayerChunk)
            {
                _lastPlayerChunk = playerChunk;
                UpdateActiveChunks(playerChunk);
            }
        }

        /// <summary>
        /// Convert a world position to chunk coordinates.
        /// </summary>
        public static Vector2Int WorldToChunk(Vector3 worldPos)
        {
            return new Vector2Int(
                Mathf.FloorToInt(worldPos.x / CHUNK_SIZE),
                Mathf.FloorToInt(worldPos.z / CHUNK_SIZE)
            );
        }

        /// <summary>
        /// Register a GameObject in the chunk system.
        /// </summary>
        public void RegisterObject(GameObject obj)
        {
            Vector2Int coord = WorldToChunk(obj.transform.position);
            Chunk chunk = GetOrCreateChunk(coord);
            chunk.objects.Add(obj);

            // Activate or deactivate based on current state
            if (!chunk.isActive)
                obj.SetActive(false);
        }

        /// <summary>
        /// Remove a GameObject from the chunk system.
        /// </summary>
        public void UnregisterObject(GameObject obj)
        {
            Vector2Int coord = WorldToChunk(obj.transform.position);
            if (_chunks.TryGetValue(coord, out Chunk chunk))
            {
                chunk.objects.Remove(obj);
            }
        }

        /// <summary>
        /// Get or create a chunk at the given coordinate.
        /// </summary>
        public Chunk GetOrCreateChunk(Vector2Int coord)
        {
            if (!_chunks.TryGetValue(coord, out Chunk chunk))
            {
                chunk = new Chunk
                {
                    coord = coord,
                    worldBounds = new Bounds(
                        new Vector3((coord.x + 0.5f) * CHUNK_SIZE, 0, (coord.y + 0.5f) * CHUNK_SIZE),
                        new Vector3(CHUNK_SIZE, 500f, CHUNK_SIZE)
                    ),
                    isActive = false,
                };
                _chunks[coord] = chunk;
            }
            return chunk;
        }

        private void UpdateActiveChunks(Vector2Int center)
        {
            HashSet<Vector2Int> newActive = new HashSet<Vector2Int>();

            for (int dx = -activeRadius; dx <= activeRadius; dx++)
            {
                for (int dz = -activeRadius; dz <= activeRadius; dz++)
                {
                    Vector2Int coord = new Vector2Int(center.x + dx, center.y + dz);
                    newActive.Add(coord);
                }
            }

            // Deactivate chunks that are no longer in range
            foreach (var coord in _activeChunks)
            {
                if (!newActive.Contains(coord) && _chunks.TryGetValue(coord, out Chunk chunk))
                {
                    SetChunkActive(chunk, false);
                }
            }

            // Activate new chunks
            foreach (var coord in newActive)
            {
                if (!_activeChunks.Contains(coord))
                {
                    if (_chunks.TryGetValue(coord, out Chunk chunk))
                    {
                        SetChunkActive(chunk, true);
                    }
                }
            }

            _activeChunks = newActive;
        }

        private void SetChunkActive(Chunk chunk, bool active)
        {
            chunk.isActive = active;
            for (int i = 0; i < chunk.objects.Count; i++)
            {
                if (chunk.objects[i] != null)
                    chunk.objects[i].SetActive(active);
            }
        }

        /// <summary>Check if a world position is in an active chunk.</summary>
        public bool IsPositionActive(Vector3 worldPos)
        {
            return _activeChunks.Contains(WorldToChunk(worldPos));
        }

        /// <summary>Total number of tracked chunks.</summary>
        public int TotalChunks => _chunks.Count;

        /// <summary>Number of currently active chunks.</summary>
        public int ActiveChunkCount => _activeChunks.Count;
    }
}
