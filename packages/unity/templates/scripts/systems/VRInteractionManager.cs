using UnityEngine;

namespace Insimul.Systems
{
    /// <summary>
    /// VR interaction system: grab, poke, and ray-based interaction.
    /// Uses XRRayInteractor + TeleportationProvider for teleport locomotion.
    /// </summary>
    public class VRInteractionManager : MonoBehaviour
    {
        [Header("Interaction Settings")]
        public float rayLength = 10f;
        public float hapticIntensity = 0.3f;
        public float hapticDuration = 0.1f;
        public LayerMask teleportLayers;

        private bool _teleportEnabled = true;
        private bool _grabEnabled = true;

        public static VRInteractionManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void SetTeleportEnabled(bool enabled)
        {
            _teleportEnabled = enabled;
        }

        public void SetGrabEnabled(bool enabled)
        {
            _grabEnabled = enabled;
        }

        public void TriggerHaptic(string hand, float intensity, float duration)
        {
            Debug.Log($"[Insimul] VR haptic: {hand} intensity={intensity} duration={duration}");
        }

        public bool IsPointingAt(out RaycastHit hit)
        {
            var cam = Camera.main;
            if (cam == null) { hit = default; return false; }
            return Physics.Raycast(cam.transform.position, cam.transform.forward, out hit, rayLength);
        }
    }
}
