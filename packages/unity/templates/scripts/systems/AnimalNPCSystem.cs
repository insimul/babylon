using UnityEngine;
using UnityEngine.AI;
using System.Collections.Generic;
using Insimul.Core;

namespace Insimul.Systems
{
    public enum AnimalBehavior { Wander, Flee, Follow, Idle, Rideable }

    /// <summary>
    /// Spawns animal GameObjects from IR animals data (cats, dogs, birds, horses).
    /// Animals use simplified NavMeshAgent for wandering. Wild animals flee from player,
    /// pets follow. Supports rideable animals (horses, alpacas) with mount/dismount.
    /// </summary>
    public class AnimalNPCSystem : MonoBehaviour
    {
        [Header("Settings")]
        public float fleeDistance = 8f;
        public float fleeSpeed = 6f;
        public float wanderRadius = 20f;
        public float wanderInterval = 10f;
        public int maxAnimals = 30;

        private readonly List<AnimalEntry> _animals = new List<AnimalEntry>();
        private Transform _player;

        public static AnimalNPCSystem Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public GameObject SpawnAnimal(string animalType, Vector3 position, AnimalBehavior behavior)
        {
            if (_animals.Count >= maxAnimals) return null;

            var prefab = Resources.Load<GameObject>($"Models/Animals/{animalType}");
            GameObject animalObj;

            if (prefab != null)
            {
                animalObj = Instantiate(prefab, position, Quaternion.identity);
            }
            else
            {
                animalObj = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                animalObj.transform.position = position;
                animalObj.transform.localScale = GetAnimalScale(animalType);
            }

            animalObj.name = $"Animal_{animalType}_{_animals.Count}";

            var agent = animalObj.AddComponent<NavMeshAgent>();
            agent.speed = 2f;
            agent.radius = 0.3f;
            agent.height = 1f;

            if (NavMesh.SamplePosition(position, out NavMeshHit hit, 10f, NavMesh.AllAreas))
            {
                animalObj.transform.position = hit.position;
            }

            var entry = new AnimalEntry
            {
                gameObject = animalObj,
                agent = agent,
                behavior = behavior,
                animalType = animalType,
                homePosition = position,
                wanderTimer = Random.Range(0f, wanderInterval),
            };

            _animals.Add(entry);

            Debug.Log($"[Insimul] Spawned {animalType} at {position} (behavior: {behavior})");
            return animalObj;
        }

        private void Update()
        {
            if (_player == null)
            {
                var playerObj = GameObject.FindGameObjectWithTag("Player");
                if (playerObj != null) _player = playerObj.transform;
                else return;
            }

            for (int i = _animals.Count - 1; i >= 0; i--)
            {
                var entry = _animals[i];
                if (entry.gameObject == null) { _animals.RemoveAt(i); continue; }

                switch (entry.behavior)
                {
                    case AnimalBehavior.Wander:
                        UpdateWander(entry);
                        break;
                    case AnimalBehavior.Flee:
                        UpdateFlee(entry);
                        break;
                    case AnimalBehavior.Follow:
                        UpdateFollow(entry);
                        break;
                    case AnimalBehavior.Rideable:
                        UpdateRideable(entry);
                        break;
                }
            }
        }

        private void UpdateWander(AnimalEntry entry)
        {
            entry.wanderTimer += Time.deltaTime;
            if (entry.wanderTimer < wanderInterval) return;
            entry.wanderTimer = 0f;

            Vector3 randomPoint = entry.homePosition + Random.insideUnitSphere * wanderRadius;
            randomPoint.y = entry.homePosition.y;

            if (NavMesh.SamplePosition(randomPoint, out NavMeshHit hit, wanderRadius, NavMesh.AllAreas))
            {
                entry.agent.speed = 1.5f;
                entry.agent.SetDestination(hit.position);
            }
        }

        private void UpdateFlee(AnimalEntry entry)
        {
            float dist = Vector3.Distance(entry.gameObject.transform.position, _player.position);
            if (dist < fleeDistance)
            {
                Vector3 fleeDir = (entry.gameObject.transform.position - _player.position).normalized;
                Vector3 fleeTarget = entry.gameObject.transform.position + fleeDir * fleeDistance;

                if (NavMesh.SamplePosition(fleeTarget, out NavMeshHit hit, fleeDistance, NavMesh.AllAreas))
                {
                    entry.agent.speed = fleeSpeed;
                    entry.agent.SetDestination(hit.position);
                }
            }
            else
            {
                UpdateWander(entry);
            }
        }

        private void UpdateFollow(AnimalEntry entry)
        {
            float dist = Vector3.Distance(entry.gameObject.transform.position, _player.position);
            if (dist > 3f)
            {
                entry.agent.speed = 3.5f;
                entry.agent.SetDestination(_player.position);
            }
            else
            {
                entry.agent.ResetPath();
            }
        }

        private void UpdateRideable(AnimalEntry entry)
        {
            if (!entry.isMounted)
            {
                UpdateWander(entry);
            }
        }

        public bool MountAnimal(GameObject animalObj)
        {
            foreach (var entry in _animals)
            {
                if (entry.gameObject == animalObj && entry.behavior == AnimalBehavior.Rideable && !entry.isMounted)
                {
                    entry.isMounted = true;
                    entry.agent.enabled = false;
                    Debug.Log($"[Insimul] Mounted {entry.animalType}");
                    return true;
                }
            }
            return false;
        }

        public void DismountAnimal(GameObject animalObj)
        {
            foreach (var entry in _animals)
            {
                if (entry.gameObject == animalObj && entry.isMounted)
                {
                    entry.isMounted = false;
                    entry.agent.enabled = true;
                    Debug.Log($"[Insimul] Dismounted {entry.animalType}");
                    return;
                }
            }
        }

        private Vector3 GetAnimalScale(string type)
        {
            switch (type)
            {
                case "horse": case "alpaca": return new Vector3(0.8f, 1.2f, 1.5f);
                case "dog": return new Vector3(0.4f, 0.5f, 0.6f);
                case "cat": return new Vector3(0.3f, 0.3f, 0.4f);
                case "bird": return new Vector3(0.15f, 0.15f, 0.15f);
                default: return new Vector3(0.5f, 0.5f, 0.5f);
            }
        }

        private class AnimalEntry
        {
            public GameObject gameObject;
            public NavMeshAgent agent;
            public AnimalBehavior behavior;
            public string animalType;
            public Vector3 homePosition;
            public float wanderTimer;
            public bool isMounted;
        }
    }
}
