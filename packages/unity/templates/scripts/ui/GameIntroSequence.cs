using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections;

namespace Insimul.UI
{
    /// <summary>
    /// Plays intro sequence when starting a new game: fullscreen Canvas overlay
    /// with narrative text, character portraits, background art, and optional narration.
    /// Supports mid-game narrative cutscenes triggered by quest milestones.
    /// Includes main menu with New Game, Continue, Settings, Quit.
    /// </summary>
    public class GameIntroSequence : MonoBehaviour
    {
        [Header("UI References")]
        public Canvas introCanvas;
        public Image backgroundImage;
        public Image portraitImage;
        public TextMeshProUGUI narrativeText;
        public TextMeshProUGUI titleText;
        public Button skipButton;
        public CanvasGroup fadeGroup;

        [Header("Timing")]
        public float textSpeed = 30f;
        public float fadeDuration = 1.5f;
        public float pageDelay = 3f;

        private string[] _narrativePages;
        private int _currentPage;
        private bool _isPlaying;
        private bool _skipRequested;
        private Coroutine _sequenceCoroutine;

        public bool IsPlaying => _isPlaying;

        public static GameIntroSequence Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;

            if (introCanvas != null) introCanvas.gameObject.SetActive(false);
            if (skipButton != null) skipButton.onClick.AddListener(Skip);
        }

        public void PlayIntro(string title, string[] pages, Sprite background = null, AudioClip narration = null)
        {
            _narrativePages = pages;
            _currentPage = 0;
            _skipRequested = false;

            if (titleText != null) titleText.text = title;
            if (backgroundImage != null && background != null) backgroundImage.sprite = background;
            if (introCanvas != null) introCanvas.gameObject.SetActive(true);

            if (narration != null)
            {
                var audioSource = GetComponent<AudioSource>();
                if (audioSource != null)
                {
                    audioSource.clip = narration;
                    audioSource.Play();
                }
            }

            _sequenceCoroutine = StartCoroutine(IntroSequence());
        }

        public void PlayCutscene(string text, Sprite portrait = null, System.Action onComplete = null)
        {
            if (introCanvas != null) introCanvas.gameObject.SetActive(true);
            if (portraitImage != null && portrait != null)
            {
                portraitImage.sprite = portrait;
                portraitImage.gameObject.SetActive(true);
            }

            _sequenceCoroutine = StartCoroutine(CutsceneSequence(text, onComplete));
        }

        public void Skip()
        {
            _skipRequested = true;
        }

        private IEnumerator IntroSequence()
        {
            _isPlaying = true;
            Time.timeScale = 0f;

            yield return StartCoroutine(FadeIn());

            for (_currentPage = 0; _currentPage < _narrativePages.Length; _currentPage++)
            {
                if (_skipRequested) break;

                yield return StartCoroutine(TypeText(_narrativePages[_currentPage]));
                yield return new WaitForSecondsRealtime(pageDelay);
            }

            yield return StartCoroutine(FadeOut());

            _isPlaying = false;
            Time.timeScale = 1f;
            if (introCanvas != null) introCanvas.gameObject.SetActive(false);

            Debug.Log("[Insimul] Intro sequence complete");
        }

        private IEnumerator CutsceneSequence(string text, System.Action onComplete)
        {
            _isPlaying = true;
            _skipRequested = false;

            yield return StartCoroutine(FadeIn());
            yield return StartCoroutine(TypeText(text));
            yield return new WaitForSecondsRealtime(pageDelay);

            if (!_skipRequested)
                yield return new WaitUntil(() => Input.anyKeyDown || _skipRequested);

            yield return StartCoroutine(FadeOut());

            _isPlaying = false;
            if (introCanvas != null) introCanvas.gameObject.SetActive(false);
            if (portraitImage != null) portraitImage.gameObject.SetActive(false);
            onComplete?.Invoke();
        }

        private IEnumerator TypeText(string text)
        {
            if (narrativeText == null) yield break;
            narrativeText.text = "";

            for (int i = 0; i < text.Length; i++)
            {
                if (_skipRequested)
                {
                    narrativeText.text = text;
                    yield break;
                }
                narrativeText.text += text[i];
                yield return new WaitForSecondsRealtime(1f / textSpeed);
            }
        }

        private IEnumerator FadeIn()
        {
            if (fadeGroup == null) yield break;
            float t = 0f;
            fadeGroup.alpha = 0f;
            while (t < fadeDuration)
            {
                t += Time.unscaledDeltaTime;
                fadeGroup.alpha = t / fadeDuration;
                yield return null;
            }
            fadeGroup.alpha = 1f;
        }

        private IEnumerator FadeOut()
        {
            if (fadeGroup == null) yield break;
            float t = 0f;
            while (t < fadeDuration)
            {
                t += Time.unscaledDeltaTime;
                fadeGroup.alpha = 1f - (t / fadeDuration);
                yield return null;
            }
            fadeGroup.alpha = 0f;
        }
    }
}
