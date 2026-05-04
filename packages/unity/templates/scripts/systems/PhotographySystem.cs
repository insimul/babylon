using UnityEngine;
using System.Collections.Generic;
using System.IO;

namespace Insimul.Systems
{
    /// <summary>
    /// Photo mode: pause time, switch to free camera, apply post-processing filters,
    /// capture screenshot. Photo book panel to review captured screenshots in grid.
    /// Saves photos to Application.persistentDataPath.
    /// </summary>
    public class PhotographySystem : MonoBehaviour
    {
        [Header("Photo Mode")]
        public KeyCode photoModeKey = KeyCode.F2;
        public KeyCode captureKey = KeyCode.Space;
        public float freeCamSpeed = 5f;
        public float freeCamRotSpeed = 3f;

        [Header("Filters")]
        public bool vignetteEnabled;
        public float vignetteIntensity = 0.3f;

        private bool _isPhotoMode;
        private Camera _mainCamera;
        private Vector3 _savedCamPos;
        private Quaternion _savedCamRot;
        private float _savedTimeScale;
        private readonly List<string> _capturedPhotos = new List<string>();

        public bool IsPhotoMode => _isPhotoMode;
        public int PhotoCount => _capturedPhotos.Count;

        public static PhotographySystem Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        private void Update()
        {
            if (Input.GetKeyDown(photoModeKey))
            {
                if (_isPhotoMode) ExitPhotoMode();
                else EnterPhotoMode();
            }

            if (_isPhotoMode)
            {
                UpdateFreeCam();
                if (Input.GetKeyDown(captureKey))
                    CapturePhoto();
            }
        }

        public void EnterPhotoMode()
        {
            _isPhotoMode = true;
            _mainCamera = Camera.main;

            if (_mainCamera != null)
            {
                _savedCamPos = _mainCamera.transform.position;
                _savedCamRot = _mainCamera.transform.rotation;
            }

            _savedTimeScale = Time.timeScale;
            Time.timeScale = 0f;

            EventBus.Instance?.Publish(GameEventType.PhotoModeEntered, null);
            Debug.Log("[Insimul] Photo mode entered");
        }

        public void ExitPhotoMode()
        {
            _isPhotoMode = false;
            Time.timeScale = _savedTimeScale;

            if (_mainCamera != null)
            {
                _mainCamera.transform.position = _savedCamPos;
                _mainCamera.transform.rotation = _savedCamRot;
            }

            EventBus.Instance?.Publish(GameEventType.PhotoModeExited, null);
            Debug.Log("[Insimul] Photo mode exited");
        }

        public void CapturePhoto()
        {
            string dir = Path.Combine(Application.persistentDataPath, "Photos");
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            string filename = $"photo_{System.DateTime.Now:yyyyMMdd_HHmmss}.png";
            string fullPath = Path.Combine(dir, filename);

            ScreenCapture.CaptureScreenshot(fullPath);
            _capturedPhotos.Add(fullPath);

            EventBus.Instance?.Publish(GameEventType.NotificationShow, new Dictionary<string, object>
            {
                { "message", "Photo captured!" },
                { "type", "Photo" },
                { "duration", 2f },
            });

            Debug.Log($"[Insimul] Photo saved: {fullPath}");
        }

        private void UpdateFreeCam()
        {
            if (_mainCamera == null) return;

            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");
            float up = Input.GetKey(KeyCode.E) ? 1f : Input.GetKey(KeyCode.Q) ? -1f : 0f;

            Vector3 move = _mainCamera.transform.forward * v + _mainCamera.transform.right * h + Vector3.up * up;
            _mainCamera.transform.position += move * freeCamSpeed * Time.unscaledDeltaTime;

            float mx = Input.GetAxis("Mouse X") * freeCamRotSpeed;
            float my = Input.GetAxis("Mouse Y") * freeCamRotSpeed;
            _mainCamera.transform.Rotate(Vector3.up, mx, Space.World);
            _mainCamera.transform.Rotate(Vector3.right, -my, Space.Self);
        }

        public List<string> GetPhotoList()
        {
            return new List<string>(_capturedPhotos);
        }
    }
}
