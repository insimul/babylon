using UnityEngine;
using TMPro;
using Insimul.Data;
using Insimul.Core;
using Insimul.Systems;

namespace Insimul.Characters
{
    /// <summary>
    /// Shows floating greeting text above NPCs when the player approaches.
    /// </summary>
    public class NPCGreetingSystem : MonoBehaviour
    {
        private static readonly string[] DefaultGreetings =
            { "Hello!", "Good day!", "Welcome!", "Greetings!" };

        private struct NPCGreetState
        {
            public Transform transform;
            public string greeting;
            public float lastGreetedTime;
        }

        private InsimulPlayerController _player;
        private NPCGreetState[] _npcs;
        private float _nextCheckTime;

        private const float CheckInterval = 0.25f;
        private const float GreetRange = 8f;
        private const float BroadPhaseRange = 20f;
        private const float GreetCooldown = 60f;

        private void Start()
        {
            _player = FindFirstObjectByType<InsimulPlayerController>();
            BuildNPCList();
        }

        private void BuildNPCList()
        {
            var objs = GameObject.FindGameObjectsWithTag("NPC");
            var gm = InsimulGameManager.Instance;
            var npcDataArr = gm != null && gm.WorldData != null ? gm.WorldData.entities.npcs : null;

            _npcs = new NPCGreetState[objs.Length];
            for (int i = 0; i < objs.Length; i++)
            {
                string greeting = null;
                if (npcDataArr != null && i < npcDataArr.Length)
                    greeting = npcDataArr[i].greeting;
                if (string.IsNullOrEmpty(greeting))
                    greeting = DefaultGreetings[Random.Range(0, DefaultGreetings.Length)];

                _npcs[i] = new NPCGreetState
                {
                    transform = objs[i].transform,
                    greeting = greeting,
                    lastGreetedTime = -GreetCooldown
                };
            }
        }

        private void Update()
        {
            if (_player == null || _npcs == null || Time.time < _nextCheckTime) return;
            _nextCheckTime = Time.time + CheckInterval;

            Vector3 playerPos = _player.transform.position;

            for (int i = 0; i < _npcs.Length; i++)
            {
                ref var npc = ref _npcs[i];
                if (npc.transform == null) continue;

                float dist = Vector3.Distance(playerPos, npc.transform.position);
                if (dist > BroadPhaseRange) continue;
                if (dist > GreetRange) continue;
                if (Time.time - npc.lastGreetedTime < GreetCooldown) continue;

                npc.lastGreetedTime = Time.time;
                SpawnBubble(npc.transform, npc.greeting);
                AudioManager.Instance?.PlaySFX("click");
                break; // max 1 greeting per check
            }
        }

        private void SpawnBubble(Transform parent, string text)
        {
            var go = new GameObject("GreetingBubble");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0f, 2.8f, 0f);
            go.transform.localScale = new Vector3(0.3f, 0.3f, 0.3f);

            var tmp = go.AddComponent<TextMeshPro>();
            tmp.text = text;
            tmp.fontSize = 4;
            tmp.color = new Color(1f, 0.95f, 0.85f);
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.textWrappingMode = TextWrappingModes.NoWrap;

            go.AddComponent<GreetingBubble>();
        }

        private class GreetingBubble : MonoBehaviour
        {
            private float _lifetime = 4f;
            private float _elapsed;
            private TextMeshPro _text;

            private void Start() { _text = GetComponent<TextMeshPro>(); }

            private void Update()
            {
                _elapsed += Time.deltaTime;
                if (_text != null)
                    _text.alpha = Mathf.Clamp01(1f - _elapsed / _lifetime);
                if (Camera.main != null)
                    transform.rotation = Quaternion.LookRotation(
                        transform.position - Camera.main.transform.position);
                if (_elapsed >= _lifetime)
                    Destroy(gameObject);
            }
        }
    }
}
