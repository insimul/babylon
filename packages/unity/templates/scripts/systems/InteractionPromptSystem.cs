using UnityEngine;
using TMPro;
using Insimul.Characters;

namespace Insimul.Systems
{
    /// <summary>
    /// Displays a floating world-space "[E] Verb" prompt above the nearest interactable.
    /// </summary>
    public class InteractionPromptSystem : MonoBehaviour
    {
        private InsimulPlayerController _player;
        private GameObject _promptObj;
        private TextMeshPro _tmp;

        private void Start()
        {
            _player = FindFirstObjectByType<InsimulPlayerController>();
            CreatePrompt();
        }

        private void CreatePrompt()
        {
            _promptObj = new GameObject("InteractionPrompt");
            _promptObj.transform.localScale = new Vector3(0.4f, 0.4f, 0.4f);

            _tmp = _promptObj.AddComponent<TextMeshPro>();
            _tmp.fontSize = 5;
            _tmp.color = Color.white;
            _tmp.alignment = TextAlignmentOptions.Center;
            _tmp.textWrappingMode = TextWrappingModes.NoWrap;
            _tmp.outlineWidth = 0.2f;
            _tmp.outlineColor = new Color32(0, 0, 0, 180);

            // Semi-transparent background quad
            var bg = GameObject.CreatePrimitive(PrimitiveType.Quad);
            bg.name = "PromptBG";
            bg.transform.SetParent(_promptObj.transform, false);
            bg.transform.localPosition = new Vector3(0f, 0f, -0.01f);
            bg.transform.localScale = new Vector3(2f, 0.5f, 1f);
            Object.Destroy(bg.GetComponent<Collider>());

            var mat = new Material(Shader.Find("Standard"));
            mat.color = new Color(0f, 0f, 0f, 0.5f);
            mat.SetFloat("_Mode", 3); // Transparent
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            mat.SetInt("_ZWrite", 0);
            mat.DisableKeyword("_ALPHATEST_ON");
            mat.EnableKeyword("_ALPHABLEND_ON");
            mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            mat.renderQueue = 3000;
            bg.GetComponent<MeshRenderer>().sharedMaterial = mat;

            _promptObj.SetActive(false);
        }

        private void Update()
        {
            if (_player == null || _promptObj == null) return;

            var interactable = _player.NearestInteractable;
            if (interactable != null && interactable.CanInteract)
            {
                var target = (interactable as MonoBehaviour)?.transform;
                if (target == null) { _promptObj.SetActive(false); return; }

                _promptObj.SetActive(true);
                _promptObj.transform.position = target.position + Vector3.up * 2f;
                _tmp.text = "[E] " + interactable.InteractionVerb;
            }
            else
            {
                _promptObj.SetActive(false);
            }
        }

        private void LateUpdate()
        {
            if (Camera.main != null && _promptObj.activeSelf)
            {
                _promptObj.transform.rotation = Quaternion.LookRotation(
                    _promptObj.transform.position - Camera.main.transform.position);
            }
        }
    }
}
