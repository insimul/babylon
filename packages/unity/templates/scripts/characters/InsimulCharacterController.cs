using UnityEngine;
using UnityEngine.InputSystem;
using Insimul.Systems;

namespace Insimul.Characters
{
    /// <summary>
    /// Enhanced third-person character controller with sprint, jump, and collision.
    /// Uses Unity's CharacterController component and New Input System.
    /// Integrates with CameraManager for camera-relative movement direction.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class InsimulCharacterController : MonoBehaviour
    {
        [Header("Movement")]
        public float walkSpeed = 5f;
        public float sprintSpeed = 9f;
        public float jumpHeight = 1.5f;
        public float gravity = -19.62f;
        public float rotationSpeed = 12f;
        public float slopeLimit = 45f;
        public float stepOffset = 0.4f;

        [Header("Ground Detection")]
        public float groundCheckRadius = 0.3f;
        public float groundCheckOffset = -0.1f;
        public LayerMask groundLayers = ~0;

        [Header("Camera")]
        public Transform cameraTransform;

        [Header("Stats")]
        public float health = 100f;
        public float maxHealth = 100f;
        public float energy = 100f;
        public float maxEnergy = 100f;
        public int gold = 50;

        [Header("Interaction")]
        public float interactionRadius = 2.5f;
        public LayerMask interactionLayers = ~0;

        private CharacterController _cc;
        private CharacterAnimationController _animController;
        private Vector3 _velocity;
        private Vector2 _moveInput;
        private bool _jumpPressed;
        private bool _sprintHeld;
        private bool _isGrounded;

        private IInteractable _nearestInteractable;
        private readonly Collider[] _overlapBuffer = new Collider[16];

        public bool IsGrounded => _isGrounded;
        public bool IsSprinting => _sprintHeld && _moveInput.sqrMagnitude > 0.01f;
        public float CurrentSpeed => IsSprinting ? sprintSpeed : walkSpeed;
        public IInteractable NearestInteractable => _nearestInteractable;

        public static InsimulCharacterController Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;

            _cc = GetComponent<CharacterController>();
            _cc.slopeLimit = slopeLimit;
            _cc.stepOffset = stepOffset;
            _animController = GetComponent<CharacterAnimationController>();
            gameObject.tag = "Player";

            if (cameraTransform == null && Camera.main != null)
                cameraTransform = Camera.main.transform;

            if (GetComponentInChildren<MeshRenderer>() == null)
                LoadPlayerModel();
        }

        private void LoadPlayerModel()
        {
            var prefab = Resources.Load<GameObject>("Models/Characters/Vincent-frontFacing");
            if (prefab != null)
            {
                var model = Instantiate(prefab, transform);
                model.transform.localPosition = new Vector3(0f, -_cc.height / 2f, 0f);
                Debug.Log("[Insimul] Loaded player avatar model");
                return;
            }
            BuildFallbackModel();
        }

        private void BuildFallbackModel()
        {
            int seed = (name + "player").GetHashCode();
            var rng = new System.Random(seed);
            Color[] skinTones = {
                new Color(0.96f, 0.87f, 0.77f), new Color(0.84f, 0.67f, 0.52f),
                new Color(0.62f, 0.44f, 0.30f), new Color(0.40f, 0.28f, 0.18f),
            };
            Color skin = skinTones[rng.Next(skinTones.Length)];

            var mat = new Material(Shader.Find("Standard"));
            mat.color = skin;

            var root = new GameObject("PlayerModel");
            root.transform.SetParent(transform, false);
            root.transform.localPosition = new Vector3(0f, -_cc.height / 2f, 0f);

            var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            capsule.name = "Body";
            capsule.transform.SetParent(root.transform, false);
            capsule.transform.localPosition = new Vector3(0f, 1f, 0f);
            capsule.GetComponent<MeshRenderer>().sharedMaterial = mat;
            Object.Destroy(capsule.GetComponent<Collider>());

            Debug.Log("[Insimul] Built fallback player model");
        }

        private void Update()
        {
            CheckGround();
            Move();
            ApplyGravity();
            UpdateAnimations();
            DetectInteractables();
        }

        public void OnMove(InputValue value) => _moveInput = value.Get<Vector2>();
        public void OnJump(InputValue value) => _jumpPressed = value.isPressed;
        public void OnSprint(InputValue value) => _sprintHeld = value.isPressed;

        public void OnAttack()
        {
            if (_animController != null) _animController.TriggerAttack();
        }

        public void OnInteract()
        {
            if (_animController != null) _animController.TriggerInteract();
            if (_nearestInteractable != null && _nearestInteractable.CanInteract)
                _nearestInteractable.Interact();
        }

        private void CheckGround()
        {
            Vector3 origin = transform.position + Vector3.up * groundCheckOffset;
            _isGrounded = Physics.CheckSphere(origin, groundCheckRadius, groundLayers);
        }

        private void Move()
        {
            if (_moveInput.sqrMagnitude < 0.01f) return;

            Vector3 forward = cameraTransform != null ? cameraTransform.forward : transform.forward;
            Vector3 right = cameraTransform != null ? cameraTransform.right : transform.right;
            forward.y = 0f; forward.Normalize();
            right.y = 0f; right.Normalize();

            Vector3 moveDir = forward * _moveInput.y + right * _moveInput.x;
            _cc.Move(moveDir * CurrentSpeed * Time.deltaTime);

            if (moveDir.sqrMagnitude > 0.01f)
            {
                Quaternion targetRot = Quaternion.LookRotation(moveDir);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, rotationSpeed * Time.deltaTime);
            }
        }

        private void ApplyGravity()
        {
            if (_isGrounded)
            {
                _velocity.y = -2f;
                if (_jumpPressed)
                {
                    _velocity.y = Mathf.Sqrt(jumpHeight * -2f * gravity);
                    _jumpPressed = false;
                }
            }
            else
            {
                _velocity.y += gravity * Time.deltaTime;
            }
            _cc.Move(_velocity * Time.deltaTime);
        }

        private void DetectInteractables()
        {
            int count = Physics.OverlapSphereNonAlloc(
                transform.position, interactionRadius, _overlapBuffer, interactionLayers);

            IInteractable closest = null;
            float closestDist = float.MaxValue;

            for (int i = 0; i < count; i++)
            {
                var interactable = _overlapBuffer[i].GetComponent<IInteractable>();
                if (interactable == null || !interactable.CanInteract) continue;

                float dist = Vector3.Distance(transform.position, _overlapBuffer[i].transform.position);
                if (dist < closestDist) { closestDist = dist; closest = interactable; }
            }
            _nearestInteractable = closest;
        }

        private void UpdateAnimations()
        {
            if (_animController == null) return;
            Vector3 hVel = _cc.velocity; hVel.y = 0f;
            _animController.SetSpeed(hVel.magnitude);
            _animController.SetGrounded(_isGrounded);
        }
    }
}
