using UnityEngine;
using UnityEngine.AI;

namespace Insimul.Characters
{
    /// <summary>
    /// NPC movement controller with NavMesh pathfinding.
    /// Supports patrol routes, wandering within radius, walking to buildings,
    /// and following roads. NavMeshAgent handles obstacle avoidance.
    /// Movement speed varies by activity. Integrates with NPCLocationCycler.
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent))]
    public class NPCMovementController : MonoBehaviour
    {
        [Header("Movement Speeds")]
        public float strollSpeed = 1.5f;
        public float walkSpeed = 3f;
        public float rushSpeed = 5f;

        [Header("Patrol Settings")]
        public float wanderRadius = 15f;
        public float wanderInterval = 8f;
        public float arrivalThreshold = 1f;

        [Header("Obstacle Avoidance")]
        public int avoidancePriority = 50;
        public float avoidanceRadius = 0.5f;

        private NavMeshAgent _agent;
        private NPCAnimationController _animController;
        private Vector3 _homePosition;
        private Vector3[] _patrolRoute;
        private int _patrolIndex;
        private float _wanderTimer;
        private bool _isMovingToTarget;
        private System.Action _onArrival;

        public bool IsMoving => _agent != null && _agent.hasPath && _agent.remainingDistance > arrivalThreshold;
        public Vector3 HomePosition { get => _homePosition; set => _homePosition = value; }

        private void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
            _agent.speed = walkSpeed;
            _agent.avoidancePriority = avoidancePriority;
            _agent.radius = avoidanceRadius;
            _agent.stoppingDistance = arrivalThreshold;

            _animController = GetComponent<NPCAnimationController>();
        }

        public void SetHomePosition(Vector3 pos)
        {
            _homePosition = pos;
        }

        public void SetPatrolRoute(Vector3[] route)
        {
            _patrolRoute = route;
            _patrolIndex = 0;
        }

        public void MoveTo(Vector3 target, float speed, System.Action onArrival = null)
        {
            if (_agent == null || !_agent.isOnNavMesh) return;

            _agent.speed = speed;
            _isMovingToTarget = true;
            _onArrival = onArrival;

            if (NavMesh.SamplePosition(target, out NavMeshHit hit, wanderRadius, NavMesh.AllAreas))
            {
                _agent.SetDestination(hit.position);
            }
        }

        public void MoveToBuilding(Vector3 buildingPos)
        {
            MoveTo(buildingPos, walkSpeed);
        }

        public void RushTo(Vector3 target)
        {
            MoveTo(target, rushSpeed);
        }

        public void Stroll()
        {
            _agent.speed = strollSpeed;
            _isMovingToTarget = false;
            WanderRandomly();
        }

        public void Stop()
        {
            if (_agent != null && _agent.isOnNavMesh)
            {
                _agent.ResetPath();
            }
            _isMovingToTarget = false;
            _onArrival = null;
        }

        public void ReturnHome()
        {
            MoveTo(_homePosition, walkSpeed);
        }

        private void Update()
        {
            if (_agent == null || !_agent.isOnNavMesh) return;

            if (_isMovingToTarget)
            {
                CheckArrival();
            }
            else if (_patrolRoute != null && _patrolRoute.Length > 0)
            {
                UpdatePatrol();
            }
            else
            {
                UpdateWander();
            }

            UpdateAnimation();
        }

        private void CheckArrival()
        {
            if (!_agent.pathPending && _agent.remainingDistance <= arrivalThreshold)
            {
                _isMovingToTarget = false;
                var callback = _onArrival;
                _onArrival = null;
                callback?.Invoke();
            }
        }

        private void UpdatePatrol()
        {
            if (!_agent.pathPending && _agent.remainingDistance <= arrivalThreshold)
            {
                _patrolIndex = (_patrolIndex + 1) % _patrolRoute.Length;
                _agent.speed = walkSpeed;
                _agent.SetDestination(_patrolRoute[_patrolIndex]);
            }
        }

        private void UpdateWander()
        {
            _wanderTimer += Time.deltaTime;
            if (_wanderTimer >= wanderInterval)
            {
                _wanderTimer = 0f;
                WanderRandomly();
            }
        }

        private void WanderRandomly()
        {
            Vector3 randomPoint = _homePosition + Random.insideUnitSphere * wanderRadius;
            randomPoint.y = _homePosition.y;

            if (NavMesh.SamplePosition(randomPoint, out NavMeshHit hit, wanderRadius, NavMesh.AllAreas))
            {
                _agent.SetDestination(hit.position);
            }
        }

        private void UpdateAnimation()
        {
            if (_animController == null) return;
            _animController.SetSpeed(_agent.velocity.magnitude);
        }
    }
}
