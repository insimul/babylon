using UnityEngine;

namespace Insimul.Systems
{
    /// <summary>
    /// VR combat adapter: translates VR hand gestures and controller input
    /// into combat actions. Supports swing detection for melee, point-and-shoot
    /// for ranged, and gesture-based for magic.
    /// </summary>
    public class VRCombatAdapter : MonoBehaviour
    {
        [Header("Melee Settings")]
        public float swingSpeedThreshold = 2f;
        public float swingDamageMultiplier = 1.5f;

        [Header("Ranged Settings")]
        public float aimAssistRadius = 0.3f;

        private Vector3 _prevRightHandPos;
        private Vector3 _prevLeftHandPos;
        private CombatSystem _combatSystem;

        public static VRCombatAdapter Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        private void Start()
        {
            _combatSystem = FindFirstObjectByType<CombatSystem>();
        }

        public void OnSwingDetected(Vector3 handVelocity, string hand)
        {
            float speed = handVelocity.magnitude;
            if (speed < swingSpeedThreshold) return;

            float damage = speed * swingDamageMultiplier;
            if (_combatSystem != null)
            {
                bool isCrit = speed > swingSpeedThreshold * 2f;
                float finalDamage = _combatSystem.CalculateDamage(damage, isCrit);
                Debug.Log($"[Insimul] VR melee swing: {hand} speed={speed:F1} damage={finalDamage:F0}");
            }
        }

        public void OnRangedAim(Vector3 origin, Vector3 direction)
        {
            if (Physics.SphereCast(origin, aimAssistRadius, direction, out RaycastHit hit, 50f))
            {
                Debug.Log($"[Insimul] VR ranged aim hit: {hit.collider.name}");
            }
        }

        public void OnBlockGesture()
        {
            Debug.Log("[Insimul] VR block gesture detected");
        }
    }
}
