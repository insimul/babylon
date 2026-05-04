using System;
using System.Collections.Generic;
using UnityEngine;

namespace Insimul.Systems
{
    [Serializable]
    public struct RangedWeaponData
    {
        public string name;
        public float damage;
        public float fireRate;
        public int magazineSize;
        public float reloadTime;
        public float spread;
        public float range;
        public bool isProjectile;
        public float projectileSpeed;
    }

    public class RangedCombatSystem : MonoBehaviour
    {
        public event Action<Vector3, float> OnHit;
        public event Action OnReload;
        public event Action OnEmpty;

        public int CurrentAmmo { get; private set; }
        public bool IsReloading { get; private set; }
        public bool CanFire => !IsReloading && CurrentAmmo > 0 && Time.time >= nextFireTime;

        [SerializeField] private Transform firePoint;
        [SerializeField] private GameObject projectilePrefab;
        [SerializeField] private LayerMask hitMask = ~0;

        private RangedWeaponData[] weapons;
        private RangedWeaponData? equipped;
        private float nextFireTime;
        private float reloadTimer;

        void Awake()
        {
            InitializeWeapons();
            if (firePoint == null) firePoint = transform;
        }

        void InitializeWeapons()
        {
            weapons = new RangedWeaponData[]
            {
                new RangedWeaponData { name = "Pistol",      damage = 15, fireRate = 3f,   magazineSize = 12, reloadTime = 1.2f, spread = 2f,   range = 50f,  isProjectile = false, projectileSpeed = 0 },
                new RangedWeaponData { name = "Rifle",       damage = 30, fireRate = 1.5f, magazineSize = 8,  reloadTime = 2.0f, spread = 0.5f, range = 100f, isProjectile = false, projectileSpeed = 0 },
                new RangedWeaponData { name = "Shotgun",     damage = 8,  fireRate = 1f,   magazineSize = 6,  reloadTime = 2.5f, spread = 10f,  range = 20f,  isProjectile = false, projectileSpeed = 0 },
                new RangedWeaponData { name = "Bow",         damage = 25, fireRate = 0.8f, magazineSize = 1,  reloadTime = 0.5f, spread = 1f,   range = 60f,  isProjectile = true,  projectileSpeed = 40f },
                new RangedWeaponData { name = "Magic Staff", damage = 20, fireRate = 2f,   magazineSize = 20, reloadTime = 3.0f, spread = 3f,   range = 40f,  isProjectile = true,  projectileSpeed = 25f },
            };
        }

        void Update()
        {
            if (!IsReloading) return;
            reloadTimer -= Time.deltaTime;
            if (reloadTimer <= 0f)
            {
                IsReloading = false;
                CurrentAmmo = equipped.Value.magazineSize;
                OnReload?.Invoke();
            }
        }

        public void EquipWeapon(string name)
        {
            foreach (var w in weapons)
            {
                if (w.name == name)
                {
                    equipped = w;
                    CurrentAmmo = w.magazineSize;
                    IsReloading = false;
                    nextFireTime = 0f;
                    return;
                }
            }
            Debug.LogWarning($"RangedCombatSystem: weapon '{name}' not found.");
        }

        public void Fire()
        {
            if (!equipped.HasValue || IsReloading) return;
            if (CurrentAmmo <= 0) { OnEmpty?.Invoke(); return; }
            if (Time.time < nextFireTime) return;

            nextFireTime = Time.time + 1f / equipped.Value.fireRate;
            CurrentAmmo--;

            var weapon = equipped.Value;
            bool isShotgun = weapon.name == "Shotgun";
            int pellets = isShotgun ? 8 : 1;

            for (int i = 0; i < pellets; i++)
            {
                Vector3 dir = ApplySpread(firePoint.forward, weapon.spread);
                if (weapon.isProjectile)
                    FireProjectile(dir, weapon);
                else
                    FireHitscan(dir, weapon);
            }

            if (CurrentAmmo <= 0) OnEmpty?.Invoke();
        }

        public void Reload()
        {
            if (!equipped.HasValue || IsReloading) return;
            if (CurrentAmmo >= equipped.Value.magazineSize) return;
            IsReloading = true;
            reloadTimer = equipped.Value.reloadTime;
        }

        private void FireHitscan(Vector3 direction, RangedWeaponData weapon)
        {
            Ray ray = new Ray(firePoint.position, direction);
            if (Physics.Raycast(ray, out RaycastHit hit, weapon.range, hitMask))
            {
                float distance = hit.distance;
                float falloff = Mathf.Clamp01(1f - distance / weapon.range);
                float dmg = weapon.damage * falloff;
                OnHit?.Invoke(hit.point, dmg);

                var damageable = hit.collider.GetComponent<IDamageable>();
                damageable?.TakeDamage(dmg);
            }
        }

        private void FireProjectile(Vector3 direction, RangedWeaponData weapon)
        {
            GameObject prefab = projectilePrefab;
            if (prefab == null)
            {
                prefab = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                prefab.transform.localScale = Vector3.one * 0.15f;
                prefab.SetActive(false);
            }

            GameObject proj = Instantiate(prefab, firePoint.position, Quaternion.LookRotation(direction));
            proj.SetActive(true);
            proj.transform.localScale = Vector3.one * 0.15f;

            var rb = proj.GetComponent<Rigidbody>();
            if (rb == null) rb = proj.AddComponent<Rigidbody>();
            rb.useGravity = false;
            rb.linearVelocity = direction * weapon.projectileSpeed;

            var handler = proj.GetComponent<ProjectileHandler>();
            if (handler == null) handler = proj.AddComponent<ProjectileHandler>();
            handler.Init(weapon.damage, weapon.range / weapon.projectileSpeed, this);

            if (prefab != projectilePrefab) Destroy(prefab);
        }

        private Vector3 ApplySpread(Vector3 forward, float spreadDeg)
        {
            float halfSpread = spreadDeg * 0.5f;
            float yaw = UnityEngine.Random.Range(-halfSpread, halfSpread);
            float pitch = UnityEngine.Random.Range(-halfSpread, halfSpread);
            Quaternion rot = Quaternion.Euler(pitch, yaw, 0);
            return rot * forward;
        }

        internal void NotifyProjectileHit(Vector3 position, float damage)
        {
            OnHit?.Invoke(position, damage);
        }
    }

    public interface IDamageable
    {
        void TakeDamage(float amount);
    }

    public class ProjectileHandler : MonoBehaviour
    {
        private float damage;
        private float lifetime;
        private RangedCombatSystem owner;

        public void Init(float dmg, float life, RangedCombatSystem system)
        {
            damage = dmg;
            lifetime = life;
            owner = system;
            Destroy(gameObject, lifetime);
        }

        void OnCollisionEnter(Collision collision)
        {
            owner?.NotifyProjectileHit(transform.position, damage);
            var damageable = collision.collider.GetComponent<IDamageable>();
            damageable?.TakeDamage(damage);
            Destroy(gameObject);
        }
    }
}
