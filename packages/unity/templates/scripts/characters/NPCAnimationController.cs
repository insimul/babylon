using UnityEngine;

namespace Insimul.Characters
{
    /// <summary>
    /// NPC animation controller using Animator state machine.
    /// States: idle, walk, run, talk, sit, work, eat, sleep, interact, combat.
    /// Uses blend trees for locomotion and CrossFade for smooth transitions.
    /// Supports occupation-specific work animations.
    /// </summary>
    [RequireComponent(typeof(Animator))]
    public class NPCAnimationController : MonoBehaviour
    {
        [Header("Animation Settings")]
        public float locomotionBlendSpeed = 5f;
        public float crossFadeDuration = 0.2f;

        [Header("Speed Thresholds")]
        public float walkThreshold = 0.1f;
        public float runThreshold = 3.5f;

        private Animator _animator;
        private string _currentState = "Idle";
        private string _occupation;

        private static readonly int Speed = Animator.StringToHash("Speed");
        private static readonly int IsGrounded = Animator.StringToHash("IsGrounded");
        private static readonly int IsTalking = Animator.StringToHash("IsTalking");
        private static readonly int IsSitting = Animator.StringToHash("IsSitting");
        private static readonly int IsWorking = Animator.StringToHash("IsWorking");
        private static readonly int IsEating = Animator.StringToHash("IsEating");
        private static readonly int IsSleeping = Animator.StringToHash("IsSleeping");
        private static readonly int AttackTrigger = Animator.StringToHash("Attack");
        private static readonly int InteractTrigger = Animator.StringToHash("Interact");

        private void Awake()
        {
            _animator = GetComponent<Animator>();
            LoadAnimationClips();
        }

        public void SetOccupation(string occupation)
        {
            _occupation = occupation;
        }

        public void SetSpeed(float speed)
        {
            if (_animator == null) return;
            _animator.SetFloat(Speed, speed, 0.1f, Time.deltaTime);
        }

        public void SetGrounded(bool grounded)
        {
            if (_animator == null) return;
            _animator.SetBool(IsGrounded, grounded);
        }

        public void PlayState(string state)
        {
            if (_animator == null || state == _currentState) return;

            ResetAllBools();

            switch (state)
            {
                case "talk":
                    _animator.SetBool(IsTalking, true);
                    break;
                case "sit":
                    _animator.SetBool(IsSitting, true);
                    break;
                case "work":
                    PlayWorkAnimation();
                    return;
                case "eat":
                    _animator.SetBool(IsEating, true);
                    break;
                case "sleep":
                    _animator.SetBool(IsSleeping, true);
                    break;
                case "interact":
                    _animator.SetTrigger(InteractTrigger);
                    break;
                case "combat":
                    _animator.SetTrigger(AttackTrigger);
                    break;
                default:
                    break;
            }

            _currentState = state;
        }

        public void TriggerAttack()
        {
            if (_animator != null) _animator.SetTrigger(AttackTrigger);
        }

        public void TriggerInteract()
        {
            if (_animator != null) _animator.SetTrigger(InteractTrigger);
        }

        private void PlayWorkAnimation()
        {
            _animator.SetBool(IsWorking, true);

            string clipName = GetOccupationClipName();
            if (!string.IsNullOrEmpty(clipName))
            {
                _animator.CrossFade(clipName, crossFadeDuration);
            }
            _currentState = "work";
        }

        private string GetOccupationClipName()
        {
            switch (_occupation)
            {
                case "blacksmith": return "Work_Hammering";
                case "merchant":   return "Work_Gesturing";
                case "guard":      return "Work_Patrolling";
                case "farmer":     return "Work_Farming";
                case "tavern":     return "Work_Serving";
                case "healer":     return "Work_Mixing";
                case "scholar":    return "Work_Writing";
                default:           return "Work_Generic";
            }
        }

        private void ResetAllBools()
        {
            if (_animator == null) return;
            _animator.SetBool(IsTalking, false);
            _animator.SetBool(IsSitting, false);
            _animator.SetBool(IsWorking, false);
            _animator.SetBool(IsEating, false);
            _animator.SetBool(IsSleeping, false);
        }

        private void LoadAnimationClips()
        {
            var clips = Resources.LoadAll<AnimationClip>("Animations/NPC");
            if (clips != null && clips.Length > 0)
            {
                Debug.Log($"[Insimul] Loaded {clips.Length} NPC animation clips");
            }
        }

        public void StopAll()
        {
            ResetAllBools();
            _currentState = "Idle";
        }
    }
}
