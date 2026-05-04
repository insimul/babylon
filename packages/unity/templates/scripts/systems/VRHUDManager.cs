using UnityEngine;

namespace Insimul.Systems
{
    /// <summary>
    /// VR HUD manager: world-space Canvas UI panels for VR.
    /// Panels follow the player's head with smooth lag and are positioned
    /// at comfortable viewing distance and angle.
    /// </summary>
    public class VRHUDManager : MonoBehaviour
    {
        [Header("HUD Settings")]
        public float hudDistance = 2f;
        public float hudVerticalOffset = -0.3f;
        public float followSpeed = 3f;
        public float recenterAngle = 30f;

        private Canvas _hudCanvas;
        private Transform _cameraTransform;
        private Vector3 _targetPosition;
        private bool _needsRecenter = true;

        public static VRHUDManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        private void Start()
        {
            _cameraTransform = Camera.main?.transform;
            CreateHUDCanvas();
        }

        private void CreateHUDCanvas()
        {
            var canvasObj = new GameObject("VR HUD Canvas");
            canvasObj.transform.SetParent(transform, false);
            _hudCanvas = canvasObj.AddComponent<Canvas>();
            _hudCanvas.renderMode = RenderMode.WorldSpace;

            var rectTransform = canvasObj.GetComponent<RectTransform>();
            rectTransform.sizeDelta = new Vector2(1f, 0.6f);
            rectTransform.localScale = Vector3.one * 0.001f;
        }

        private void LateUpdate()
        {
            if (_cameraTransform == null)
            {
                _cameraTransform = Camera.main?.transform;
                return;
            }
            if (_hudCanvas == null) return;

            Vector3 forward = _cameraTransform.forward;
            forward.y = 0f;
            forward.Normalize();

            Vector3 desiredPos = _cameraTransform.position + forward * hudDistance + Vector3.up * hudVerticalOffset;

            float angle = Vector3.Angle(_hudCanvas.transform.forward, forward);
            if (angle > recenterAngle) _needsRecenter = true;

            if (_needsRecenter)
            {
                _targetPosition = desiredPos;
                float dist = Vector3.Distance(_hudCanvas.transform.position, _targetPosition);
                if (dist < 0.05f) _needsRecenter = false;
            }

            _hudCanvas.transform.position = Vector3.Lerp(_hudCanvas.transform.position, _targetPosition, Time.deltaTime * followSpeed);
            _hudCanvas.transform.LookAt(_cameraTransform.position);
            _hudCanvas.transform.Rotate(0f, 180f, 0f);
        }

        public Canvas GetHUDCanvas()
        {
            return _hudCanvas;
        }
    }
}
