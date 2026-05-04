using UnityEngine;
using Insimul.Data;

namespace Insimul.Characters
{
    /// <summary>
    /// Drives an Animator component based on character movement and state.
    /// Attach to any character (player or NPC) that has an Animator.
    /// Falls back gracefully when no Animator is present.
    /// </summary>
    public class CharacterAnimationController : MonoBehaviour
    {
        [Header("Animator Parameters")]
        public static readonly int SpeedHash = Animator.StringToHash("Speed");
        public static readonly int IsGroundedHash = Animator.StringToHash("IsGrounded");
        public static readonly int IsTalkingHash = Animator.StringToHash("IsTalking");
        public static readonly int AttackHash = Animator.StringToHash("Attack");
        public static readonly int InteractHash = Animator.StringToHash("Interact");
        public static readonly int DieHash = Animator.StringToHash("Die");

        [Header("Settings")]
        public float dampTime = 0.1f;
        public float runSpeedThreshold = 4f;

        private Animator _animator;
        private bool _hasAnimator;

        private void Awake()
        {
            _animator = GetComponentInChildren<Animator>();
            _hasAnimator = _animator != null;
            if (!_hasAnimator)
            {
                Debug.LogWarning($"[Insimul] No Animator found on {gameObject.name} — animations disabled");
            }
        }

        /// <summary>
        /// Call each frame with the character's current horizontal speed.
        /// Maps to the Speed float parameter for blend tree (0 = idle, >0 = walk/run).
        /// </summary>
        public void SetSpeed(float speed)
        {
            if (!_hasAnimator) return;
            _animator.SetFloat(SpeedHash, speed, dampTime, Time.deltaTime);
        }

        /// <summary>
        /// Sets the grounded state. Used to trigger fall/land transitions.
        /// </summary>
        public void SetGrounded(bool grounded)
        {
            if (!_hasAnimator) return;
            _animator.SetBool(IsGroundedHash, grounded);
        }

        /// <summary>
        /// Sets the talking state for dialogue animations.
        /// </summary>
        public void SetTalking(bool talking)
        {
            if (!_hasAnimator) return;
            _animator.SetBool(IsTalkingHash, talking);
        }

        /// <summary>
        /// Fires a one-shot attack trigger.
        /// </summary>
        public void TriggerAttack()
        {
            if (!_hasAnimator) return;
            _animator.SetTrigger(AttackHash);
        }

        /// <summary>
        /// Fires a one-shot interact trigger.
        /// </summary>
        public void TriggerInteract()
        {
            if (!_hasAnimator) return;
            _animator.SetTrigger(InteractHash);
        }

        /// <summary>
        /// Fires the death trigger. Intended as a one-way transition.
        /// </summary>
        public void TriggerDie()
        {
            if (!_hasAnimator) return;
            _animator.SetTrigger(DieHash);
        }

        /// <summary>
        /// Plays an animation clip by name from loaded InsimulAnimationData.
        /// Useful for action-specific animations not covered by the state machine.
        /// </summary>
        public void PlayClip(string clipName, float crossFadeDuration = 0.2f)
        {
            if (!_hasAnimator) return;
            _animator.CrossFadeInFixedTime(clipName, crossFadeDuration);
        }

        /// <summary>
        /// Returns true if the Animator component was found and is active.
        /// </summary>
        public bool HasAnimator => _hasAnimator;
    }
}
