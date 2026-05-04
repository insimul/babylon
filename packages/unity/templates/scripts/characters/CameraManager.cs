using UnityEngine;

namespace Insimul.Characters
{
    public enum CameraMode { Exterior, Interior, Dialogue }

    /// <summary>
    /// Camera manager with orbit and follow modes.
    /// Uses Cinemachine-style orbit around player with mouse/right-stick rotation,
    /// zoom with scroll wheel, and obstacle avoidance via raycasting.
    /// Supports smooth transitions between exterior, interior, and dialogue cameras.
    /// </summary>
    public class CameraManager : MonoBehaviour
    {
        [Header("Target")]
        public Transform target;

        [Header("Orbit Settings")]
        public float orbitDistance = 8f;
        public float minDistance = 2f;
        public float maxDistance = 15f;
        public float orbitSpeed = 3f;
        public float zoomSpeed = 2f;
        public float verticalMinAngle = -20f;
        public float verticalMaxAngle = 60f;

        [Header("Follow Settings")]
        public float followSmoothTime = 0.15f;
        public Vector3 followOffset = new Vector3(0f, 2f, 0f);

        [Header("Collision")]
        public float collisionRadius = 0.3f;
        public LayerMask collisionLayers = ~0;

        [Header("Mode Presets")]
        public float interiorDistance = 4f;
        public float interiorVerticalAngle = 30f;
        public float dialogueDistance = 2.5f;
        public float dialogueVerticalAngle = 10f;

        private CameraMode _currentMode = CameraMode.Exterior;
        private float _yaw;
        private float _pitch = 20f;
        private float _currentDistance;
        private float _targetDistance;
        private Vector3 _smoothVelocity;
        private Transform _dialogueTarget;

        public CameraMode CurrentMode => _currentMode;

        public static CameraManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            _currentDistance = orbitDistance;
            _targetDistance = orbitDistance;
        }

        private void Start()
        {
            if (target == null)
            {
                var player = GameObject.FindGameObjectWithTag("Player");
                if (player != null) target = player.transform;
            }
        }

        private void LateUpdate()
        {
            if (target == null) return;

            HandleInput();

            switch (_currentMode)
            {
                case CameraMode.Exterior:
                    UpdateOrbitCamera(orbitDistance);
                    break;
                case CameraMode.Interior:
                    UpdateOrbitCamera(interiorDistance);
                    break;
                case CameraMode.Dialogue:
                    UpdateDialogueCamera();
                    break;
            }
        }

        private void HandleInput()
        {
            if (Input.GetMouseButton(1) || _currentMode == CameraMode.Exterior)
            {
                _yaw += Input.GetAxis("Mouse X") * orbitSpeed;
                _pitch -= Input.GetAxis("Mouse Y") * orbitSpeed;
                _pitch = Mathf.Clamp(_pitch, verticalMinAngle, verticalMaxAngle);
            }

            float scroll = Input.GetAxis("Mouse ScrollWheel");
            if (Mathf.Abs(scroll) > 0.01f)
            {
                _targetDistance -= scroll * zoomSpeed;
                _targetDistance = Mathf.Clamp(_targetDistance, minDistance, maxDistance);
            }

            _currentDistance = Mathf.Lerp(_currentDistance, _targetDistance, Time.deltaTime * 8f);
        }

        private void UpdateOrbitCamera(float baseDistance)
        {
            Quaternion rotation = Quaternion.Euler(_pitch, _yaw, 0f);
            Vector3 pivotPoint = target.position + followOffset;
            Vector3 desiredPosition = pivotPoint - rotation * Vector3.forward * Mathf.Min(_currentDistance, baseDistance);

            float actualDistance = Mathf.Min(_currentDistance, baseDistance);
            if (Physics.SphereCast(pivotPoint, collisionRadius, (desiredPosition - pivotPoint).normalized,
                out RaycastHit hit, actualDistance, collisionLayers))
            {
                desiredPosition = pivotPoint + (desiredPosition - pivotPoint).normalized * (hit.distance - 0.1f);
            }

            transform.position = Vector3.SmoothDamp(transform.position, desiredPosition, ref _smoothVelocity, followSmoothTime);
            transform.LookAt(pivotPoint);
        }

        private void UpdateDialogueCamera()
        {
            if (_dialogueTarget == null) { SetMode(CameraMode.Exterior); return; }

            Vector3 midpoint = (target.position + _dialogueTarget.position) / 2f + Vector3.up * 1.5f;
            Vector3 dir = (_dialogueTarget.position - target.position).normalized;
            Vector3 side = Vector3.Cross(dir, Vector3.up).normalized;
            Vector3 desiredPos = midpoint + side * dialogueDistance + Vector3.up * 0.5f;

            transform.position = Vector3.SmoothDamp(transform.position, desiredPos, ref _smoothVelocity, followSmoothTime);
            transform.LookAt(_dialogueTarget.position + Vector3.up * 1.5f);
        }

        public void SetMode(CameraMode mode, Transform dialogueTarget = null)
        {
            _currentMode = mode;
            _dialogueTarget = dialogueTarget;

            switch (mode)
            {
                case CameraMode.Interior:
                    _targetDistance = interiorDistance;
                    _pitch = interiorVerticalAngle;
                    break;
                case CameraMode.Dialogue:
                    break;
                default:
                    _targetDistance = orbitDistance;
                    break;
            }

            Debug.Log($"[Insimul] Camera mode: {mode}");
        }
    }
}
