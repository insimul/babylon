using UnityEngine;
using UnityEngine.InputSystem;
using Insimul.Systems;

namespace Insimul.Characters
{
    /// <summary>
    /// Third-person player controller with New Input System support.
    /// Attach to the Player GameObject with a CharacterController component.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class InsimulPlayerController : MonoBehaviour
    {
        [Header("Movement")]
        public float moveSpeed = {{PLAYER_SPEED}}f;
        public float jumpHeight = {{PLAYER_JUMP_HEIGHT}}f;
        public float gravity = -9.81f * {{PLAYER_GRAVITY}}f;
        public float rotationSpeed = 10f;

        [Header("Camera")]
        public Transform cameraTransform;

        [Header("Stats")]
        public float health = {{PLAYER_INITIAL_HEALTH}}f;
        public float maxHealth = {{PLAYER_INITIAL_HEALTH}}f;
        public float energy = {{PLAYER_INITIAL_ENERGY}}f;
        public int gold = {{PLAYER_INITIAL_GOLD}};

        [Header("Interaction")]
        public float interactionRadius = 2f;
        public LayerMask interactionLayers = ~0;

        private CharacterController _controller;
        private CharacterAnimationController _animController;
        private Vector3 _velocity;
        private Vector2 _moveInput;
        private bool _jumpPressed;

        private IInteractable _nearestInteractable;
        private readonly Collider[] _overlapBuffer = new Collider[16];

        public IInteractable NearestInteractable => _nearestInteractable;

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
            _animController = GetComponent<CharacterAnimationController>();
            gameObject.tag = "Player";
            if (cameraTransform == null && Camera.main != null)
                cameraTransform = Camera.main.transform;
            if (GetComponentInChildren<MeshRenderer>() == null)
                BuildPlayerModel();
        }

        /// <summary>
        /// Build a procedural humanoid mesh so the player is visible (not an invisible capsule).
        /// Uses deterministic colors derived from the world seed hash.
        /// </summary>
        private void BuildPlayerModel()
        {
            int seed = (name + "player").GetHashCode();
            var rng = new System.Random(seed);

            // Skin tone palette (8 tones, warm browns)
            Color[] skinTones = {
                new Color(0.96f, 0.87f, 0.77f), new Color(0.92f, 0.78f, 0.65f),
                new Color(0.84f, 0.67f, 0.52f), new Color(0.74f, 0.56f, 0.40f),
                new Color(0.62f, 0.44f, 0.30f), new Color(0.50f, 0.35f, 0.22f),
                new Color(0.40f, 0.28f, 0.18f), new Color(0.32f, 0.22f, 0.14f),
            };
            Color skin = skinTones[rng.Next(skinTones.Length)];

            // Clothing colors (12 options)
            Color[] clothingColors = {
                new Color(0.2f, 0.35f, 0.6f), new Color(0.6f, 0.2f, 0.2f),
                new Color(0.2f, 0.5f, 0.25f), new Color(0.5f, 0.4f, 0.15f),
                new Color(0.45f, 0.2f, 0.5f), new Color(0.3f, 0.3f, 0.3f),
                new Color(0.55f, 0.35f, 0.2f), new Color(0.15f, 0.4f, 0.45f),
                new Color(0.65f, 0.55f, 0.3f), new Color(0.35f, 0.15f, 0.15f),
                new Color(0.2f, 0.2f, 0.4f),  new Color(0.5f, 0.5f, 0.45f),
            };
            Color clothing = clothingColors[rng.Next(clothingColors.Length)];

            var skinMat = new Material(Shader.Find("Standard"));
            skinMat.color = skin;
            skinMat.SetFloat("_Glossiness", 0.2f);

            var clothMat = new Material(Shader.Find("Standard"));
            clothMat.color = clothing;
            clothMat.SetFloat("_Glossiness", 0.15f);

            var root = new GameObject("PlayerModel");
            root.transform.SetParent(transform, false);
            // Offset so model's feet align with CharacterController bottom
            root.transform.localPosition = new Vector3(0f, -_controller.height / 2f, 0f);

            // Head (sphere)
            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.name = "Head";
            head.transform.SetParent(root.transform, false);
            head.transform.localPosition = new Vector3(0f, 1.6f, 0f);
            head.transform.localScale = new Vector3(0.3f, 0.35f, 0.3f);
            head.GetComponent<MeshRenderer>().sharedMaterial = skinMat;
            Object.Destroy(head.GetComponent<Collider>());

            // Torso (capsule)
            var torso = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            torso.name = "Torso";
            torso.transform.SetParent(root.transform, false);
            torso.transform.localPosition = new Vector3(0f, 1.1f, 0f);
            torso.transform.localScale = new Vector3(0.35f, 0.35f, 0.22f);
            torso.GetComponent<MeshRenderer>().sharedMaterial = clothMat;
            Object.Destroy(torso.GetComponent<Collider>());

            // Left arm
            var lArm = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            lArm.name = "LeftArm";
            lArm.transform.SetParent(root.transform, false);
            lArm.transform.localPosition = new Vector3(-0.28f, 1.1f, 0f);
            lArm.transform.localScale = new Vector3(0.1f, 0.25f, 0.1f);
            lArm.GetComponent<MeshRenderer>().sharedMaterial = clothMat;
            Object.Destroy(lArm.GetComponent<Collider>());

            // Right arm
            var rArm = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            rArm.name = "RightArm";
            rArm.transform.SetParent(root.transform, false);
            rArm.transform.localPosition = new Vector3(0.28f, 1.1f, 0f);
            rArm.transform.localScale = new Vector3(0.1f, 0.25f, 0.1f);
            rArm.GetComponent<MeshRenderer>().sharedMaterial = clothMat;
            Object.Destroy(rArm.GetComponent<Collider>());

            // Left leg
            var lLeg = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            lLeg.name = "LeftLeg";
            lLeg.transform.SetParent(root.transform, false);
            lLeg.transform.localPosition = new Vector3(-0.1f, 0.45f, 0f);
            lLeg.transform.localScale = new Vector3(0.12f, 0.3f, 0.12f);
            lLeg.GetComponent<MeshRenderer>().sharedMaterial = clothMat;
            Object.Destroy(lLeg.GetComponent<Collider>());

            // Right leg
            var rLeg = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            rLeg.name = "RightLeg";
            rLeg.transform.SetParent(root.transform, false);
            rLeg.transform.localPosition = new Vector3(0.1f, 0.45f, 0f);
            rLeg.transform.localScale = new Vector3(0.12f, 0.3f, 0.12f);
            rLeg.GetComponent<MeshRenderer>().sharedMaterial = clothMat;
            Object.Destroy(rLeg.GetComponent<Collider>());

            Debug.Log("[Insimul] Built procedural player model");
        }

        private void Update()
        {
            Move();
            ApplyGravity();
            UpdateAnimations();
            DetectInteractables();
        }

        public void OnMove(InputValue value) => _moveInput = value.Get<Vector2>();
        public void OnJump(InputValue value) => _jumpPressed = value.isPressed;

        public void OnAttack()
        {
            if (_animController != null) _animController.TriggerAttack();
            Debug.Log("[Insimul] Player Attack");
        }

        public void OnInteract()
        {
            if (_animController != null) _animController.TriggerInteract();
            if (_nearestInteractable != null && _nearestInteractable.CanInteract)
            {
                _nearestInteractable.Interact();
            }
            Debug.Log("[Insimul] Player Interact");
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
                if (dist < closestDist)
                {
                    closestDist = dist;
                    closest = interactable;
                }
            }

            _nearestInteractable = closest;
        }

        private void Move()
        {
            if (_moveInput.sqrMagnitude < 0.01f) return;

            Vector3 forward = cameraTransform != null ? cameraTransform.forward : transform.forward;
            Vector3 right = cameraTransform != null ? cameraTransform.right : transform.right;
            forward.y = 0f; forward.Normalize();
            right.y = 0f; right.Normalize();

            Vector3 moveDir = forward * _moveInput.y + right * _moveInput.x;
            _controller.Move(moveDir * moveSpeed * Time.deltaTime);

            if (moveDir.sqrMagnitude > 0.01f)
            {
                Quaternion targetRot = Quaternion.LookRotation(moveDir);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, rotationSpeed * Time.deltaTime);
            }
        }

        private void ApplyGravity()
        {
            if (_controller.isGrounded)
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
            _controller.Move(_velocity * Time.deltaTime);
        }

        private void UpdateAnimations()
        {
            if (_animController == null) return;
            Vector3 horizontalVelocity = _controller.velocity;
            horizontalVelocity.y = 0f;
            _animController.SetSpeed(horizontalVelocity.magnitude);
            _animController.SetGrounded(_controller.isGrounded);
        }
    }
}
