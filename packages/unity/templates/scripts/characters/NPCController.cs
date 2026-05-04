using UnityEngine;
using UnityEngine.AI;
using Insimul.Core;
using Insimul.Data;

namespace Insimul.Characters
{
    public enum NPCState { Idle, Patrol, Talking, Fleeing, Pursuing, Alert, ScheduleMove }

    /// <summary>
    /// NPC controller using Unity NavMesh for pathfinding.
    /// When schedule data is present, the NPC follows time-based activities
    /// driven by the GameClock singleton.
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent))]
    public class NPCController : MonoBehaviour
    {
        [Header("NPC Data")]
        public string characterId;
        public string role;
        public Vector3 homePosition;
        public float patrolRadius = 20f;
        public float disposition = 50f;
        public string settlementId;
        public string[] questIds;

        [Header("State")]
        public NPCState currentState = NPCState.Idle;

        [Header("Schedule")]
        public bool hasSchedule;
        public int currentBlockIndex = -1;

        private NavMeshAgent _agent;
        private CharacterAnimationController _animController;
        private float _patrolTimer;
        private float _patrolInterval = 5f;
        private ScheduleBlockData[] _scheduleBlocks;
        private string _homeBuildingId;
        private string _workBuildingId;
        private string[] _friendBuildingIds;
        private float _loiterTimer;
        private Vector3 _scheduleTarget;

        private void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
            _animController = GetComponent<CharacterAnimationController>();
            _agent.speed = 2f;
        }

        public void InitFromData(InsimulNPCData data)
        {
            characterId = data.characterId;
            role = data.role;
            homePosition = data.homePosition.ToVector3();
            patrolRadius = data.patrolRadius;
            disposition = data.disposition;
            settlementId = data.settlementId;
            questIds = data.questIds ?? new string[0];

            transform.position = homePosition;

            if (data.schedule != null && data.schedule.blocks != null && data.schedule.blocks.Length > 0)
            {
                _scheduleBlocks = data.schedule.blocks;
                _homeBuildingId = data.schedule.homeBuildingId;
                _workBuildingId = data.schedule.workBuildingId;
                _friendBuildingIds = data.schedule.friendBuildingIds ?? new string[0];
                hasSchedule = true;
            }

            Debug.Log($"[Insimul] NPC {characterId} initialized at {homePosition} (role: {role}, schedule: {hasSchedule})");
        }

        private void Update()
        {
            if (hasSchedule && currentState != NPCState.Talking)
                EvaluateSchedule();

            switch (currentState)
            {
                case NPCState.Idle:
                    if (!hasSchedule) UpdateIdle();
                    break;
                case NPCState.Patrol:
                    UpdatePatrol();
                    break;
                case NPCState.ScheduleMove:
                    UpdateScheduleMove();
                    break;
                case NPCState.Talking:
                    break;
                case NPCState.Fleeing:
                    break;
                case NPCState.Pursuing:
                    break;
                case NPCState.Alert:
                    break;
            }
            UpdateAnimations();
        }

        private void EvaluateSchedule()
        {
            float hour = GameClock.Instance != null ? GameClock.Instance.CurrentHour : 12f;
            int blockIdx = FindBlockForHour(hour);
            if (blockIdx < 0 || blockIdx == currentBlockIndex) return;

            currentBlockIndex = blockIdx;
            var block = _scheduleBlocks[blockIdx];
            Vector3 target = ResolveActivityTarget(block);
            _scheduleTarget = target;

            if (block.activity == "sleep" || block.activity == "idle_at_home")
            {
                NavigateTo(target);
                return;
            }

            if (block.activity == "wander")
            {
                currentState = NPCState.Patrol;
                return;
            }

            NavigateTo(target);
        }

        private int FindBlockForHour(float hour)
        {
            if (_scheduleBlocks == null) return -1;

            int bestIdx = -1;
            int bestPriority = -1;

            for (int i = 0; i < _scheduleBlocks.Length; i++)
            {
                var b = _scheduleBlocks[i];
                bool inBlock;
                if (b.startHour <= b.endHour)
                    inBlock = hour >= b.startHour && hour < b.endHour;
                else
                    inBlock = hour >= b.startHour || hour < b.endHour;

                if (inBlock && b.priority > bestPriority)
                {
                    bestPriority = b.priority;
                    bestIdx = i;
                }
            }
            return bestIdx;
        }

        private Vector3 ResolveActivityTarget(ScheduleBlockData block)
        {
            if (!string.IsNullOrEmpty(block.buildingId))
            {
                Vector3 pos = ResolveBuildingPosition(block.buildingId);
                if (pos != Vector3.zero) return pos;
            }
            return homePosition;
        }

        private Vector3 ResolveBuildingPosition(string buildingId)
        {
            if (InsimulGameManager.Instance == null || !InsimulGameManager.Instance.IsDataLoaded)
                return Vector3.zero;

            var buildings = InsimulGameManager.Instance.WorldData?.entities?.buildings;
            if (buildings == null) return Vector3.zero;

            foreach (var b in buildings)
            {
                if (b.id == buildingId)
                    return b.position.ToVector3();
            }
            return Vector3.zero;
        }

        private void NavigateTo(Vector3 target)
        {
            if (NavMesh.SamplePosition(target, out NavMeshHit hit, patrolRadius, NavMesh.AllAreas))
            {
                _agent.SetDestination(hit.position);
                currentState = NPCState.ScheduleMove;
            }
        }

        private void UpdateScheduleMove()
        {
            if (!_agent.pathPending && _agent.remainingDistance < 1f)
            {
                currentState = NPCState.Idle;
                _loiterTimer = 0f;
            }
        }

        private void UpdateIdle()
        {
            _patrolTimer += Time.deltaTime;
            if (_patrolTimer >= _patrolInterval)
            {
                _patrolTimer = 0f;
                currentState = NPCState.Patrol;
                Vector3 randomPoint = homePosition + Random.insideUnitSphere * patrolRadius;
                randomPoint.y = homePosition.y;
                if (NavMesh.SamplePosition(randomPoint, out NavMeshHit hit, patrolRadius, NavMesh.AllAreas))
                {
                    _agent.SetDestination(hit.position);
                }
            }
        }

        private void UpdatePatrol()
        {
            if (!_agent.pathPending && _agent.remainingDistance < 0.5f)
            {
                currentState = NPCState.Idle;
            }
        }

        public void StartDialogue(GameObject initiator)
        {
            currentState = NPCState.Talking;
            _agent.ResetPath();
            transform.LookAt(initiator.transform);
            if (_animController != null) _animController.SetTalking(true);
            Debug.Log($"[Insimul] NPC {characterId} starting dialogue");
        }

        public void EndDialogue()
        {
            currentState = NPCState.Idle;
            currentBlockIndex = -1;
            if (_animController != null) _animController.SetTalking(false);
        }

        private void UpdateAnimations()
        {
            if (_animController == null) return;
            _animController.SetSpeed(_agent.velocity.magnitude);
            _animController.SetGrounded(true);
        }
    }
}
