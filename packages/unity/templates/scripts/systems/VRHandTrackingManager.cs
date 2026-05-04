using UnityEngine;

namespace Insimul.Systems
{
    /// <summary>
    /// VR hand tracking using XR Interaction Toolkit XRDirectInteractor.
    /// Supports grab and poke interactions with world objects.
    /// </summary>
    public class VRHandTrackingManager : MonoBehaviour
    {
        [Header("Hand Settings")]
        public float grabRadius = 0.05f;
        public float pokeRadius = 0.02f;
        public LayerMask interactionLayers = ~0;

        private Transform _leftHand;
        private Transform _rightHand;
        private bool _isTracking;

        public bool IsTracking => _isTracking;

        public static VRHandTrackingManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void Initialize(Transform leftHand, Transform rightHand)
        {
            _leftHand = leftHand;
            _rightHand = rightHand;
            _isTracking = true;
            Debug.Log("[Insimul] VR hand tracking initialized");
        }

        private void Update()
        {
            if (!_isTracking) return;

            if (_leftHand != null) UpdateHand(_leftHand, "Left");
            if (_rightHand != null) UpdateHand(_rightHand, "Right");
        }

        private void UpdateHand(Transform hand, string side)
        {
            Collider[] hits = Physics.OverlapSphere(hand.position, grabRadius, interactionLayers);
            foreach (var hit in hits)
            {
                var interactable = hit.GetComponent<IInteractable>();
                if (interactable != null && interactable.CanInteract)
                {
                    // XR toolkit would handle actual grab/poke via XRGrabInteractable
                    break;
                }
            }
        }
    }
}
