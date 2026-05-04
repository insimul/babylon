using UnityEngine;

namespace Insimul.Characters
{
    public class NPCTalkingIndicator : MonoBehaviour
    {
        public static void Show(GameObject npc)
        {
            var bubble = npc.GetComponent<TalkingBubble>();
            if (bubble == null) bubble = npc.AddComponent<TalkingBubble>();
            bubble.SetActive(true);
        }

        public static void Hide(GameObject npc)
        {
            var bubble = npc.GetComponent<TalkingBubble>();
            if (bubble != null) bubble.SetActive(false);
        }
    }

    public class TalkingBubble : MonoBehaviour
    {
        private GameObject _root;
        private Renderer[] _dotRenderers;
        private Material _dotMat;
        private bool _active;
        private float _timer;
        private const float Period = 1.5f;

        private void Awake()
        {
            var bubbleMat = new Material(Shader.Find("Standard"))
                { color = new Color(0.95f, 0.95f, 0.95f) };
            _dotMat = new Material(Shader.Find("Standard"))
                { color = new Color(0.3f, 0.3f, 0.3f) };
            EnableTransparency(_dotMat);

            _root = new GameObject("TalkingBubble");
            _root.transform.SetParent(transform, false);
            _root.transform.localPosition = new Vector3(0f, 2.5f, 0.3f);

            var ellipsoid = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            ellipsoid.transform.SetParent(_root.transform, false);
            ellipsoid.transform.localScale = new Vector3(0.4f, 0.25f, 0.1f);
            ellipsoid.GetComponent<Renderer>().material = bubbleMat;
            Destroy(ellipsoid.GetComponent<Collider>());

            _dotRenderers = new Renderer[3];
            for (int i = 0; i < 3; i++)
            {
                var dot = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                dot.transform.SetParent(_root.transform, false);
                dot.transform.localPosition = new Vector3(-0.1f + i * 0.1f, 0f, -0.05f);
                dot.transform.localScale = Vector3.one * 0.04f;
                dot.GetComponent<Renderer>().material = new Material(_dotMat);
                Destroy(dot.GetComponent<Collider>());
                _dotRenderers[i] = dot.GetComponent<Renderer>();
            }
            _root.SetActive(false);
        }

        public void SetActive(bool active)
        {
            _active = active;
            _root.SetActive(active);
            _timer = 0f;
        }

        private void Update()
        {
            if (!_active) return;
            // Billboard toward camera
            if (Camera.main != null)
                _root.transform.forward = Camera.main.transform.forward;

            _timer += Time.deltaTime;
            float t = (_timer % Period) / Period; // 0..1
            for (int i = 0; i < 3; i++)
            {
                float dotStart = i / 3f;
                float alpha = (t < 0.75f)
                    ? Mathf.Clamp01((t - dotStart) / 0.25f)
                    : Mathf.Clamp01(1f - (t - 0.75f) / 0.25f);
                var c = _dotRenderers[i].material.color;
                c.a = alpha;
                _dotRenderers[i].material.color = c;
            }
        }

        private static void EnableTransparency(Material mat)
        {
            mat.SetFloat("_Mode", 3);
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            mat.SetInt("_ZWrite", 0);
            mat.DisableKeyword("_ALPHATEST_ON");
            mat.EnableKeyword("_ALPHABLEND_ON");
            mat.renderQueue = 3000;
        }
    }
}
