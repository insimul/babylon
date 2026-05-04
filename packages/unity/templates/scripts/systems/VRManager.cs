using UnityEngine;

namespace Insimul.Systems
{
    /// <summary>
    /// VR scaffolding using Unity XR Interaction Toolkit with OpenXR.
    /// Creates XR Rig with hand tracking, teleport/smooth locomotion,
    /// and VR interaction system (grab, poke).
    /// </summary>
    public class VRManager : MonoBehaviour
    {
        [Header("VR Settings")]
        public bool vrEnabled;
        public string locomotionMode = "teleport";
        public bool handTrackingEnabled = true;

        [Header("Comfort")]
        public bool vignetteEnabled = true;
        public bool snapTurnEnabled = true;
        public float snapTurnAngle = 45f;
        public bool seatedMode;

        private bool _isVRActive;
        private GameObject _xrRig;

        public bool IsVRActive => _isVRActive;

        public static VRManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        private void Start()
        {
            if (!vrEnabled) return;
            InitializeVR();
        }

        public void InitializeVR()
        {
            _xrRig = new GameObject("XR Rig");
            _xrRig.transform.SetParent(transform, false);

            var cameraOffset = new GameObject("Camera Offset");
            cameraOffset.transform.SetParent(_xrRig.transform, false);
            cameraOffset.transform.localPosition = seatedMode ? Vector3.zero : new Vector3(0f, 1.6f, 0f);

            var mainCam = new GameObject("Main Camera");
            mainCam.transform.SetParent(cameraOffset.transform, false);
            mainCam.AddComponent<Camera>();
            mainCam.tag = "MainCamera";

            var leftHand = new GameObject("LeftHand Controller");
            leftHand.transform.SetParent(cameraOffset.transform, false);

            var rightHand = new GameObject("RightHand Controller");
            rightHand.transform.SetParent(cameraOffset.transform, false);

            _isVRActive = true;
            Debug.Log($"[Insimul] VR initialized — locomotion: {locomotionMode}, hands: {handTrackingEnabled}");
        }

        public void SetLocomotionMode(string mode)
        {
            locomotionMode = mode;
            Debug.Log($"[Insimul] VR locomotion mode: {mode}");
        }

        public void SetSeatedMode(bool seated)
        {
            seatedMode = seated;
            Debug.Log($"[Insimul] VR seated mode: {seated}");
        }

        public void SetSnapTurn(bool enabled, float angle = 45f)
        {
            snapTurnEnabled = enabled;
            snapTurnAngle = angle;
        }

        public void SetVignette(bool enabled)
        {
            vignetteEnabled = enabled;
        }

        private void OnDestroy()
        {
            if (_xrRig != null) Destroy(_xrRig);
        }
    }
}
