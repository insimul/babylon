using System;
using System.Collections.Generic;
using UnityEngine;
using Insimul.Data;

namespace Insimul.World
{
    public class AnimalAmbientLifeSystem : MonoBehaviour
    {
        private const int MaxAnimals = 100;

        public enum AnimalType { Cat, Dog, Bird }

        private static readonly Color[][] AnimalColors = {
            new[] { new Color(0.1f,0.1f,0.1f), new Color(0.8f,0.5f,0.2f), new Color(0.5f,0.5f,0.5f), new Color(0.9f,0.88f,0.85f) },
            new[] { new Color(0.45f,0.3f,0.15f), new Color(0.12f,0.12f,0.12f), new Color(0.75f,0.6f,0.3f), new Color(0.85f,0.82f,0.78f) },
            new[] { new Color(0.2f,0.3f,0.7f), new Color(0.7f,0.2f,0.15f), new Color(0.4f,0.3f,0.2f), new Color(0.8f,0.75f,0.2f) }
        };

        private readonly Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();
        private readonly Dictionary<AnimalType, Mesh> _templateMeshes = new Dictionary<AnimalType, Mesh>();
        private Transform _root;
        private int _spawnCount;

        public void Initialize(InsimulWorldIR worldData)
        {
            _root = new GameObject("AmbientAnimals").transform;
            _root.SetParent(transform);

            BuildTemplateMeshes();

            string seed = worldData.meta?.seed ?? "animals";
            var rng = new System.Random(seed.GetHashCode());
            var settlements = worldData.geography?.settlements;
            if (settlements == null) return;

            foreach (var settlement in settlements)
            {
                if (_spawnCount >= MaxAnimals) break;
                Vector3 center = settlement.position != null
                    ? new Vector3(settlement.position.x, 0f, settlement.position.z)
                    : Vector3.zero;

                SpawnGroup(AnimalType.Cat, rng.Next(2, 5), center, rng);
                SpawnGroup(AnimalType.Dog, rng.Next(1, 4), center, rng);
                SpawnGroup(AnimalType.Bird, rng.Next(3, 7), center, rng);
            }
        }

        private void SpawnGroup(AnimalType type, int count, Vector3 center, System.Random rng)
        {
            float minScale = type == AnimalType.Dog ? 0.9f : 0.8f;
            float maxScale = type == AnimalType.Dog ? 1.2f : 1.0f;

            for (int i = 0; i < count && _spawnCount < MaxAnimals; i++)
            {
                float angle = (float)(rng.NextDouble() * Math.PI * 2);
                float dist = 5f + (float)(rng.NextDouble() * 25f);
                Vector3 pos = center + new Vector3(Mathf.Cos(angle) * dist, 500f, Mathf.Sin(angle) * dist);

                if (!Physics.Raycast(pos, Vector3.down, out RaycastHit hit, 1000f))
                    continue;

                float y = hit.point.y;
                if (type == AnimalType.Bird)
                    y += 3f + (float)(rng.NextDouble() * 5f);

                pos = new Vector3(pos.x, y, pos.z);

                int colorIdx = rng.Next(0, 4);
                float scale = minScale + (float)(rng.NextDouble() * (maxScale - minScale));

                var go = new GameObject($"{type}_{_spawnCount}");
                go.transform.SetParent(_root);
                go.transform.position = pos;
                go.transform.localScale = Vector3.one * scale;
                go.transform.rotation = Quaternion.Euler(0f, (float)(rng.NextDouble() * 360f), 0f);

                var mf = go.AddComponent<MeshFilter>();
                mf.sharedMesh = _templateMeshes[type];
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = GetMaterial(type, colorIdx);

                var behavior = go.AddComponent<AnimalBehavior>();
                behavior.Setup(type, pos, type == AnimalType.Cat ? 1f : type == AnimalType.Dog ? 1.5f : 2f);

                _spawnCount++;
            }
        }

        private Material GetMaterial(AnimalType type, int colorIdx)
        {
            string key = $"animal_{type}_{colorIdx}";
            if (_materialCache.TryGetValue(key, out Material mat)) return mat;

            mat = new Material(Shader.Find("Standard"));
            mat.color = AnimalColors[(int)type][colorIdx];
            mat.SetFloat("_Glossiness", 0.15f);
            _materialCache[key] = mat;
            return mat;
        }

        #region Template Mesh Building

        private void BuildTemplateMeshes()
        {
            _templateMeshes[AnimalType.Cat] = BuildCatMesh();
            _templateMeshes[AnimalType.Dog] = BuildDogMesh();
            _templateMeshes[AnimalType.Bird] = BuildBirdMesh();
        }

        private Mesh BuildCatMesh()
        {
            var parts = new List<CombineInstance>();
            AddPrimitive(parts, PrimitiveType.Sphere, Vector3.zero, new Vector3(0.3f, 0.2f, 0.5f), Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Sphere, new Vector3(0f, 0.05f, 0.25f), new Vector3(0.18f, 0.18f, 0.18f), Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cube, new Vector3(-0.06f, 0.17f, 0.27f), new Vector3(0.05f, 0.08f, 0.03f), Quaternion.Euler(0f, 0f, 20f));
            AddPrimitive(parts, PrimitiveType.Cube, new Vector3(0.06f, 0.17f, 0.27f), new Vector3(0.05f, 0.08f, 0.03f), Quaternion.Euler(0f, 0f, -20f));
            AddPrimitive(parts, PrimitiveType.Cylinder, new Vector3(0f, 0.05f, -0.25f), new Vector3(0.04f, 0.175f, 0.04f), Quaternion.Euler(-45f, 0f, 0f));
            return CombineParts(parts);
        }

        private Mesh BuildDogMesh()
        {
            var parts = new List<CombineInstance>();
            AddPrimitive(parts, PrimitiveType.Cube, Vector3.zero, new Vector3(0.3f, 0.25f, 0.5f), Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cube, new Vector3(0f, 0.05f, 0.3f), new Vector3(0.2f, 0.2f, 0.22f), Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cube, new Vector3(0f, -0.02f, 0.42f), new Vector3(0.1f, 0.08f, 0.12f), Quaternion.identity);
            // Legs
            float lx = 0.1f, lz = 0.18f;
            var legScale = new Vector3(0.08f, 0.2f, 0.08f);
            AddPrimitive(parts, PrimitiveType.Cylinder, new Vector3(-lx, -0.22f, lz), legScale, Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cylinder, new Vector3(lx, -0.22f, lz), legScale, Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cylinder, new Vector3(-lx, -0.22f, -lz), legScale, Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cylinder, new Vector3(lx, -0.22f, -lz), legScale, Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cylinder, new Vector3(0f, 0.05f, -0.25f), new Vector3(0.05f, 0.125f, 0.05f), Quaternion.Euler(-60f, 0f, 0f));
            return CombineParts(parts);
        }

        private Mesh BuildBirdMesh()
        {
            var parts = new List<CombineInstance>();
            AddPrimitive(parts, PrimitiveType.Sphere, Vector3.zero, new Vector3(0.08f, 0.07f, 0.1f), Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cube, new Vector3(-0.09f, 0f, 0f), new Vector3(0.12f, 0.01f, 0.06f), Quaternion.identity);
            AddPrimitive(parts, PrimitiveType.Cube, new Vector3(0.09f, 0f, 0f), new Vector3(0.12f, 0.01f, 0.06f), Quaternion.identity);
            return CombineParts(parts);
        }

        private void AddPrimitive(List<CombineInstance> parts, PrimitiveType prim, Vector3 pos, Vector3 scale, Quaternion rot)
        {
            var go = GameObject.CreatePrimitive(prim);
            go.transform.position = pos;
            go.transform.localScale = scale;
            go.transform.rotation = rot;

            var ci = new CombineInstance();
            ci.mesh = go.GetComponent<MeshFilter>().sharedMesh;
            ci.transform = go.transform.localToWorldMatrix;
            parts.Add(ci);

            DestroyImmediate(go);
        }

        private Mesh CombineParts(List<CombineInstance> parts)
        {
            var mesh = new Mesh();
            mesh.CombineMeshes(parts.ToArray(), true, true);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        #endregion
    }

    public class AnimalBehavior : MonoBehaviour
    {
        private enum State { Idle, Wander, Sit, Fly }

        private State _state;
        private float _timer;
        private Vector3 _spawnPoint;
        private Vector3 _wanderTarget;
        private float _speed;
        private float _flyAngle;
        private float _flyRadius;
        private bool _isCat;
        private bool _isBird;
        private Vector3 _originalScale;

        public void Setup(AnimalAmbientLifeSystem.AnimalType type, Vector3 spawn, float speed)
        {
            _spawnPoint = spawn;
            _speed = speed;
            _isCat = type == AnimalAmbientLifeSystem.AnimalType.Cat;
            _isBird = type == AnimalAmbientLifeSystem.AnimalType.Bird;
            _originalScale = transform.localScale;

            if (_isBird)
            {
                _state = State.Fly;
                _flyRadius = UnityEngine.Random.Range(5f, 10f);
                _flyAngle = UnityEngine.Random.Range(0f, Mathf.PI * 2f);
            }
            else
            {
                _state = State.Idle;
                _timer = UnityEngine.Random.Range(3f, 8f);
            }
        }

        private void Update()
        {
            switch (_state)
            {
                case State.Idle: UpdateIdle(); break;
                case State.Wander: UpdateWander(); break;
                case State.Sit: UpdateSit(); break;
                case State.Fly: UpdateFly(); break;
            }
        }

        private void UpdateIdle()
        {
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;

            if (_isCat && UnityEngine.Random.value < 0.2f)
            {
                _state = State.Sit;
                _timer = UnityEngine.Random.Range(5f, 15f);
                var s = _originalScale;
                s.y *= 0.7f;
                transform.localScale = s;
                return;
            }

            PickWanderTarget();
            _state = State.Wander;
        }

        private void UpdateWander()
        {
            Vector3 dir = _wanderTarget - transform.position;
            dir.y = 0f;
            if (dir.sqrMagnitude < 0.1f)
            {
                _state = State.Idle;
                _timer = UnityEngine.Random.Range(3f, 8f);
                return;
            }

            transform.position = Vector3.MoveTowards(transform.position, _wanderTarget, _speed * Time.deltaTime);
            if (dir.sqrMagnitude > 0.01f)
                transform.rotation = Quaternion.LookRotation(dir.normalized);
        }

        private void UpdateSit()
        {
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;

            transform.localScale = _originalScale;
            PickWanderTarget();
            _state = State.Wander;
        }

        private void UpdateFly()
        {
            _flyAngle += _speed / _flyRadius * Time.deltaTime;
            float x = _spawnPoint.x + Mathf.Cos(_flyAngle) * _flyRadius;
            float z = _spawnPoint.z + Mathf.Sin(_flyAngle) * _flyRadius;
            float y = _spawnPoint.y + Mathf.Sin(_flyAngle * 2f);

            Vector3 next = new Vector3(x, y, z);
            Vector3 dir = next - transform.position;
            if (dir.sqrMagnitude > 0.001f)
                transform.rotation = Quaternion.LookRotation(dir.normalized);
            transform.position = next;
        }

        private void PickWanderTarget()
        {
            float angle = UnityEngine.Random.Range(0f, Mathf.PI * 2f);
            float dist = UnityEngine.Random.Range(1f, 5f);
            _wanderTarget = transform.position + new Vector3(Mathf.Cos(angle) * dist, 0f, Mathf.Sin(angle) * dist);
        }
    }
}
